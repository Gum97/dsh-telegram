/**
 * Client bundle contract.
 *
 * The browser half is not an ES module: the page loads a script that calls
 * `window.__ModuleLoader__.load({ id, factory })` to register a factory, and
 * runs that factory later with its own `require`. Nothing in the normal test
 * setup exercises that shape, so a bundle that is subtly wrong — React
 * inlined, an unexpected external, a missing export — would only fail in the
 * browser, where the error points nowhere near the cause.
 *
 * These tests load the built artifact the way the page does.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE = path.join(here, '..', 'lib', 'client.js');

/** The bundle is a build artifact; skip rather than fail an unbuilt checkout. */
const built = existsSync(BUNDLE);
const scenario = (name, fn) =>
  test(name, { skip: built ? false : 'run `npm run build:client` first' }, fn);

/** Materialize the bundle exactly as the page's module loader would. */
function loadBundle(extraStubs = {}) {
  const registry = new Map();
  const previous = globalThis.window;
  globalThis.window = {
    __ModuleLoader__: { load: ({ id, factory }) => registry.set(id, factory) },
  };

  try {
    // eslint-disable-next-line no-eval -- the loader evaluates a script tag too.
    (0, eval)(readFileSync(BUNDLE, 'utf8'));
  } finally {
    globalThis.window = previous;
  }

  const stubs = {
    react: {
      useState: (initial) => [initial, () => {}],
      useEffect: () => {},
      useCallback: (fn) => fn,
      createElement: () => null,
    },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
    '@deepseek-ai/dsh-client-ui-primitives': {
      IconChevronDownOutline14: () => null,
      IconCheckOutline14: () => null,
    },
    ...extraStubs,
  };

  const seen = [];
  const factory = registry.get('dsh-telegram');
  const exported = factory((id) => {
    seen.push(id);
    if (!(id in stubs)) throw new Error(`unexpected external: ${id}`);
    return stubs[id];
  });
  return { exported, required: seen, registry };
}

scenario('the bundle registers under the package id', () => {
  const { registry } = loadBundle();
  assert.deepEqual([...registry.keys()], ['dsh-telegram']);
});

scenario('the factory materializes into a cordis plugin', () => {
  const { exported } = loadBundle();

  assert.equal(typeof exported.apply, 'function');
  assert.deepEqual(exported.inject, ['slots', 'connection']);
});

scenario('every injected name is a service the client runtime provides', () => {
  // A name no service ever registers leaves the entry pending forever, and the
  // only symptom is one boot line saying an entry did not activate — the card
  // just never appears. `api` reads like a service but is not one: it is a
  // field ON `connection`, which is how every first-party card reaches it.
  const { exported } = loadBundle();

  const CLIENT_SERVICES = new Set([
    'slots',
    'locale',
    'connection',
    'remote',
    'settingsScope',
    'runtime',
    'theme',
  ]);

  for (const name of exported.inject) {
    assert.ok(
      CLIENT_SERVICES.has(name),
      `"${name}" is not a client service, so the entry would hang pending forever`,
    );
  }
});

scenario('react is required, never bundled', () => {
  // A bundled React would give the card its own instance and break hooks at
  // runtime with an error nowhere near the cause.
  const { required } = loadBundle();
  assert.ok(required.includes('react'), 'react must stay external');
});

scenario('every external is one the page already provides', () => {
  const source = readFileSync(BUNDLE, 'utf8');
  const externals = [...source.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1]);
  const allowed = new Set([
    'react',
    'react/jsx-runtime',
    'react-dom',
    '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-client-ui-primitives',
    '@deepseek-ai/dsh-client-ui-settings',
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-runtime/client',
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-api-remotes',
  ]);

  for (const id of externals) {
    assert.ok(allowed.has(id), `bundle requires "${id}", which the page does not provide`);
  }
});

scenario('the card registers into the settings slot under its namespace', () => {
  const { exported } = loadBundle();
  const registrations = [];

  const api = { settings: {}, credentials: {} };
  exported.apply({
    // The card reaches the wire through `connection`, mirroring how the
    // first-party settings cards do it.
    get: (name) => (name === 'connection' ? { api } : undefined),
    slots: {
      inject: (_name, generator) => {
        for (const entry of generator()) registrations.push(entry);
      },
      register: (options, component) => ({ options, component }),
    },
  });

  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].options.name, 'settings.plugin.item');
  assert.equal(
    registrations[0].options.key,
    'telegram',
    'the key must match the Host settings namespace, or the tab never dispatches the card',
  );
  assert.equal(typeof registrations[0].component, 'function');

  // The card is useless without a wire handle, and resolving `api` from the
  // wrong place is exactly the bug that left the entry pending.
  assert.equal(registrations[0].options.inject().api, api);
});

scenario('the card colours itself from design tokens, never literals', () => {
  // A literal colour looks right in the theme it was written for and unreadable
  // in the other one. The page switches themes by swapping token values, so a
  // card that hard-codes `#1a1a1a` silently stops following the Appearance
  // setting the user picked in General.
  const source = readFileSync(BUNDLE, 'utf8');
  const rules = source.slice(source.indexOf('.dshtg_card{'), source.indexOf('.dshtg_code{'));

  const literals = rules.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(/g) ?? [];
  assert.deepEqual(literals, [], `card CSS must use --dsw-alias-* tokens, found ${literals}`);
  assert.ok(rules.includes('var(--dsw-alias-'), 'card CSS should read design tokens');
});

scenario('injecting styles twice leaves one stylesheet', () => {
  // Module bodies re-run when a plugin is loaded again after a retract, and
  // duplicate <style> tags would accumulate across reloads.
  const tags = [];
  const document = {
    querySelector: (selector) =>
      tags.find((tag) => selector.includes(tag.dataset.pluginCss)) ?? null,
    createElement: () => ({ dataset: {}, textContent: '' }),
    head: { appendChild: (tag) => tags.push(tag) },
  };

  const previous = globalThis.document;
  globalThis.document = document;
  try {
    const { exported } = loadBundle();
    const ctx = {
      get: () => ({ api: {} }),
      slots: { inject: () => {}, register: () => ({}) },
    };
    exported.apply(ctx);
    exported.apply(ctx);
  } finally {
    globalThis.document = previous;
  }

  assert.equal(tags.length, 1);
  assert.equal(tags[0].dataset.plugin, 'dsh-telegram');
  assert.ok(tags[0].textContent.includes('.dshtg_card'));
});

scenario('a comma-separated user list is written as the array the schema expects', () => {
  const { exported } = loadBundle();

  assert.deepEqual(exported.normalizeSection({ allowedUsers: '111, 222 ,333' }), {
    allowedUsers: ['111', '222', '333'],
  });
});

scenario('an emptied user list becomes an empty array, not a blank string', () => {
  const { exported } = loadBundle();

  // `Schema.array` rejects a string, so a cleared field must not pass one
  // through — that would fail the save with a validation error the user
  // cannot act on.
  assert.deepEqual(exported.normalizeSection({ allowedUsers: '  ' }), { allowedUsers: [] });
});

scenario('other fields pass through untouched', () => {
  const { exported } = loadBundle();

  assert.deepEqual(exported.normalizeSection({ enabled: false, workspaceRoot: '/tmp/x' }), {
    enabled: false,
    workspaceRoot: '/tmp/x',
  });
});
