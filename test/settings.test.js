/**
 * Settings namespace behaviour.
 *
 * Two properties matter more than the field list:
 *
 * 1. **A composition choice is not silently overridden.** Values pinned in a
 *    profile's `cordis.patch.yml` become the namespace `base`, and the user
 *    document layers on top. A plugin that registered without `base` would
 *    quietly discard a deployment's decision.
 * 2. **The channel survives a missing settings provider.** A headless or
 *    embedded composition may mount none, and the channel must then keep
 *    running from its entry config rather than failing to start.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SETTINGS_NAMESPACE,
  SettingsSchema,
  decideStart,
  isLiveChange,
  registerSettings,
} from '../lib/settings.js';

/** A settings service double recording how the plugin registered. */
function settingsDouble() {
  const calls = { register: [], watchers: [] };
  let value = {};
  return {
    calls,
    setValue(next) {
      value = next;
    },
    emit(next, prev) {
      for (const watcher of calls.watchers) watcher(next, prev);
    },
    register(ns, schema, options) {
      calls.register.push({ ns, schema, options });
      return {
        get: () => value,
        watch: (fn) => {
          calls.watchers.push(fn);
          return () => {};
        },
        update: async () => {},
      };
    },
  };
}

function ctxWith(settings) {
  return {
    get: (name) => (name === 'settings' ? settings : undefined),
    logger: { warn() {}, error() {}, info() {} },
  };
}

test('the namespace is registered under the key the card is dispatched on', () => {
  const settings = settingsDouble();
  registerSettings(ctxWith(settings), {});

  assert.equal(settings.calls.register[0].ns, SETTINGS_NAMESPACE);
  assert.equal(SETTINGS_NAMESPACE, 'telegram');
});

test('composition config becomes the base layer, not the user layer', () => {
  const settings = settingsDouble();
  registerSettings(ctxWith(settings), { streaming: false, allowedUsers: ['1'] });

  const { base } = settings.calls.register[0].options;
  assert.deepEqual(base, { streaming: false, allowedUsers: ['1'] });
});

test('entry keys the schema does not declare are kept out of base', () => {
  const settings = settingsDouble();
  // `bindingFile` is a deployment concern and is deliberately not user-editable;
  // passing it would fail validation on registration.
  registerSettings(ctxWith(settings), { bindingFile: '/tmp/x.json', enabled: true });

  const { base } = settings.calls.register[0].options;
  assert.deepEqual(base, { enabled: true });
});

test('a missing settings provider degrades instead of failing the channel', () => {
  const ctx = { get: () => undefined, logger: { warn() {} } };
  assert.equal(registerSettings(ctx, { enabled: true }), undefined);
});

test('a registration failure is contained', () => {
  const ctx = ctxWith({
    register() {
      throw new Error('duplicate namespace');
    },
  });

  // The channel still works from entry config; it must not take the boot down.
  assert.equal(registerSettings(ctx, {}), undefined);
});

test('the current value follows commits', () => {
  const settings = settingsDouble();
  settings.setValue({ streaming: true });
  const handle = registerSettings(ctxWith(settings), {});

  assert.deepEqual(handle.current(), { streaming: true });

  settings.setValue({ streaming: false });
  settings.emit({ streaming: false }, { streaming: true });
  assert.deepEqual(handle.current(), { streaming: false });
});

test('a throwing change handler cannot break the watcher', () => {
  const settings = settingsDouble();
  const handle = registerSettings(ctxWith(settings), {}, () => {
    throw new Error('handler exploded');
  });

  settings.setValue({ streaming: false });
  assert.doesNotThrow(() => settings.emit({ streaming: false }, {}));
  assert.deepEqual(handle.current(), { streaming: false });
});

/* --------------------------- live vs restart --------------------------- */

test('display and access changes apply without a restart', () => {
  assert.equal(isLiveChange({ allowedUsers: ['1'] }, { allowedUsers: [] }), true);
  assert.equal(isLiveChange({ streaming: false }, { streaming: true }), true);
  assert.equal(isLiveChange({ rich: false }, { rich: true }), true);
});

test('a different bot token or workspace needs a restart', () => {
  // Swapping these under a running poller would point the channel at another
  // bot, or run sessions somewhere the user did not choose.
  assert.equal(isLiveChange({ tokenRef: 'A' }, { tokenRef: 'B' }), false);
  assert.equal(isLiveChange({ workspaceRoot: '/a' }, { workspaceRoot: '/b' }), false);
  assert.equal(isLiveChange({ enabled: false }, { enabled: true }), false);
});

test('an unchanged document is a live change, so nothing is announced', () => {
  const same = { tokenRef: 'A', streaming: true };
  assert.equal(isLiveChange(same, { ...same }), true);
});

/* ------------------------------- schema -------------------------------- */

test('the schema fills defaults for an empty document', () => {
  const resolved = new SettingsSchema({});

  assert.equal(resolved.enabled, true);
  assert.equal(resolved.tokenRef, 'TELEGRAM_BOT_TOKEN');
  assert.deepEqual(resolved.allowedUsers, []);
  assert.equal(resolved.rich, true);
});

test('the schema rejects a user list that is not a list', () => {
  // The card converts its comma-separated line before saving; if that ever
  // regressed, the save must fail loudly rather than store a string.
  assert.throws(() => new SettingsSchema({ allowedUsers: '111,222' }));
});

/* ------------------------- first-run ownership ------------------------- */

test('the first /start on an unclaimed bot takes ownership', () => {
  assert.deepEqual(decideStart({ allowedUsers: [] }, 339028172), {
    kind: 'claim',
    userId: '339028172',
  });
});

test('a bot with no settings section at all is still claimable', () => {
  assert.equal(decideStart({}, 42).kind, 'claim');
  assert.equal(decideStart(undefined, 42).kind, 'claim');
});

test('once claimed, a stranger sending /start is refused', () => {
  // This is the whole point of the mechanism: a bot username is discoverable,
  // so an open /start would hand anyone an agent running shell commands on the
  // owner's machine.
  assert.deepEqual(decideStart({ allowedUsers: ['339028172'] }, 999), { kind: 'denied' });
});

test('the owner sending /start again is simply allowed', () => {
  assert.deepEqual(decideStart({ allowedUsers: ['339028172'] }, 339028172), { kind: 'allowed' });
});

test('a second /start cannot re-claim a bot that already has an owner', () => {
  // A claim path that re-fired would let the next stranger overwrite the owner
  // and lock them out of their own bot.
  const claimed = { allowedUsers: ['111'] };
  for (const stranger of [222, 333, 111]) {
    assert.notEqual(decideStart(claimed, stranger).kind, 'claim');
  }
});

test('ids are compared as text, so a numeric id matches its stored string', () => {
  assert.equal(decideStart({ allowedUsers: ['339028172'] }, 339028172).kind, 'allowed');
  assert.equal(decideStart({ allowedUsers: [339028172] }, '339028172').kind, 'allowed');
});

test('an update with no identifiable sender never claims the bot', () => {
  // Telegram always identifies a sender, so a missing id is a shape this code
  // does not understand — claiming ownership for an unknown party would be the
  // worst possible reading of it.
  for (const missing of [undefined, null, '']) {
    assert.deepEqual(decideStart({ allowedUsers: [] }, missing), { kind: 'denied' });
  }
});

test('the bot token itself is not a settings field', () => {
  // A secret in the settings document is a secret in a file users sync and
  // paste into bug reports. Only the reference belongs here.
  assert.ok(!('token' in SettingsSchema.dict));
  assert.ok('tokenRef' in SettingsSchema.dict);
});
