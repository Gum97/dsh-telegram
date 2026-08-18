/**
 * Question routing.
 *
 * This module reaches past the host's public API to share a slot the host
 * models as exclusive, so the tests that matter are the ones about giving up:
 * a host that changed shape must leave the channel exactly as it was, and no
 * failure here may ever strand a question that would otherwise have reached
 * the browser.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { installQuestionRouting } from '../lib/question-routing.js';

/** A stand-in for the host service, faithful to its one-provider rule. */
function serviceDouble(initial) {
  const svc = {
    provider: initial,
    registerProvider(provider) {
      if (svc.provider !== undefined) throw new Error('DUPLICATE_PROVIDER');
      svc.provider = provider;
      return () => {
        svc.provider = undefined;
      };
    },
  };
  return svc;
}

const quiet = { warn() {}, info() {} };

/** A provider that records what it was asked and answers with a tag. */
function providerDouble(tag) {
  const seen = [];
  return {
    seen,
    ask: async (request) => {
      seen.push(request);
      return { answers: [{ id: 'q', selected: [tag] }] };
    },
  };
}

const tgRequest = { agent: { id: 'tg-abc' }, questions: [{ id: 'q' }] };
const webRequest = { agent: { id: 'web-xyz' }, questions: [{ id: 'q' }] };

test('with a free slot it just registers, no interception', () => {
  const svc = serviceDouble(undefined);
  const mine = providerDouble('TELEGRAM');

  const routing = installQuestionRouting({
    userQuestions: svc,
    provider: mine,
    resolveTarget: () => ({ chatId: 1 }),
    logger: quiet,
  });

  assert.equal(routing.ok, true);
  assert.equal(svc.provider, mine, 'the channel provider is installed directly');
});

test('a Telegram session is answered in Telegram, everything else in the browser', async () => {
  const web = providerDouble('WEB');
  const svc = serviceDouble(web);
  const mine = providerDouble('TELEGRAM');

  installQuestionRouting({
    userQuestions: svc,
    provider: mine,
    resolveTarget: (id) => (id.startsWith('tg-') ? { chatId: 1 } : undefined),
    logger: quiet,
  });

  const a = await svc.provider.ask(tgRequest);
  const b = await svc.provider.ask(webRequest);

  assert.deepEqual(a.answers[0].selected, ['TELEGRAM']);
  assert.deepEqual(b.answers[0].selected, ['WEB']);
  assert.equal(web.seen.length, 1, 'the browser only saw the session it owns');
});

test('an unresolvable session goes to the incumbent, never nowhere', async () => {
  // The failure this forbids: a question that reaches neither surface, which
  // looks to the user like the agent stopped for no reason.
  const web = providerDouble('WEB');
  const svc = serviceDouble(web);

  installQuestionRouting({
    userQuestions: svc,
    provider: providerDouble('TELEGRAM'),
    resolveTarget: () => undefined,
    logger: quiet,
  });

  const answer = await svc.provider.ask(tgRequest);
  assert.deepEqual(answer.answers[0].selected, ['WEB']);
});

test('a throwing lookup defers to the incumbent instead of failing the ask', async () => {
  const web = providerDouble('WEB');
  const svc = serviceDouble(web);

  installQuestionRouting({
    userQuestions: svc,
    provider: providerDouble('TELEGRAM'),
    resolveTarget: () => {
      throw new Error('binding file unreadable');
    },
    logger: quiet,
  });

  const answer = await svc.provider.ask(tgRequest);
  assert.deepEqual(answer.answers[0].selected, ['WEB']);
});

test("the incumbent's rejection is passed through, not swallowed", async () => {
  const failure = new Error('user cancelled');
  const svc = serviceDouble({ ask: async () => Promise.reject(failure) });

  installQuestionRouting({
    userQuestions: svc,
    provider: providerDouble('TELEGRAM'),
    resolveTarget: () => undefined,
    logger: quiet,
  });

  await assert.rejects(() => svc.provider.ask(webRequest), failure);
});

test('an incumbent of unknown shape is left completely alone', () => {
  // A provider this code does not understand is safer untouched than replaced.
  const stranger = { notAsk: true };
  const svc = serviceDouble(stranger);

  const routing = installQuestionRouting({
    userQuestions: svc,
    provider: providerDouble('TELEGRAM'),
    resolveTarget: () => ({ chatId: 1 }),
    logger: quiet,
  });

  assert.equal(routing.ok, false);
  assert.equal(svc.provider, stranger, 'the host is untouched');
});

test('a host whose provider field cannot be reassigned is left untouched', () => {
  // The forward-compatibility guarantee: a future DSH that makes `provider`
  // private must cost the feature, not the boot.
  const web = providerDouble('WEB');
  const svc = serviceDouble(web);
  Object.defineProperty(svc, 'provider', { get: () => web, set: () => {}, configurable: true });

  const routing = installQuestionRouting({
    userQuestions: svc,
    provider: providerDouble('TELEGRAM'),
    resolveTarget: () => ({ chatId: 1 }),
    logger: quiet,
  });

  assert.equal(routing.ok, false);
  assert.equal(routing.reason, 'not-writable');
  assert.equal(svc.provider, web);
});

test('disposal gives the slot back to the incumbent', () => {
  // Unloading the channel must leave the host as it was found, or the browser
  // silently loses its ability to ask anything at all.
  const web = providerDouble('WEB');
  const svc = serviceDouble(web);

  const routing = installQuestionRouting({
    userQuestions: svc,
    provider: providerDouble('TELEGRAM'),
    resolveTarget: () => ({ chatId: 1 }),
    logger: quiet,
  });

  assert.notEqual(svc.provider, web, 'routing is in place');
  routing.dispose();
  assert.equal(svc.provider, web, 'the browser provider is restored');
});

test('disposal does not evict a third plugin that took the slot later', () => {
  const web = providerDouble('WEB');
  const svc = serviceDouble(web);

  const routing = installQuestionRouting({
    userQuestions: svc,
    provider: providerDouble('TELEGRAM'),
    resolveTarget: () => ({ chatId: 1 }),
    logger: quiet,
  });

  routing.dispose();
  const third = providerDouble('THIRD');
  svc.provider = third;

  routing.dispose();
  assert.equal(svc.provider, third, 'a later owner keeps the slot');
});

test('a missing service degrades instead of throwing', () => {
  const routing = installQuestionRouting({
    userQuestions: undefined,
    provider: providerDouble('TELEGRAM'),
    resolveTarget: () => undefined,
    logger: quiet,
  });

  assert.equal(routing.ok, false);
  assert.doesNotThrow(() => routing.dispose());
});
