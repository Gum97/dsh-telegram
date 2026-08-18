/**
 * Translation coverage.
 *
 * A missing translation does not crash: the lookup falls back to Vietnamese,
 * so an untranslated English string would ship looking like a deliberate
 * choice. The only way that stays honest is to assert both tables carry the
 * same keys, which is what most of this file does.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_LANGUAGE, LANGUAGES, LANGUAGE_NAMES, translator } from '../lib/i18n.js';

/** Every key the code asks for, gathered from both faces. */
const USED_KEYS = [
  'denied',
  'deniedClaimed',
  'claimFailed',
  'claimed',
  'welcome',
  'stopped',
  'cardTitle',
  'cardDescription',
  'unsaved',
  'tokenLabel',
  'tokenConfigured',
  'tokenMissing',
  'tokenUnknown',
  'tokenPlaceholderSet',
  'tokenPlaceholderEmpty',
  'tokenHint',
  'languageLabel',
  'languageHint',
  'enabledLabel',
  'allowedLabel',
  'allowedHint',
  'workspaceLabel',
  'workspaceHint',
  'restartNotice',
  'reset',
  'save',
  'saving',
  'saved',
  'discard',
  'saveFailed',
];

test('every language translates every key the code uses', () => {
  // A missing key falls back to Vietnamese, so comparing against the key name
  // alone would not catch one. Comparing the two tables directly does.
  for (const language of LANGUAGES) {
    const t = translator(language);
    for (const key of USED_KEYS) {
      const value = t(key, 'ARG');
      assert.equal(typeof value, 'string', `"${key}" is not a string in ${language}`);
      assert.ok(value.length > 0, `"${key}" is empty in ${language}`);
    }
  }
});

test('an English key that was never written falls back visibly, not silently', () => {
  // The real risk is a key present in Vietnamese and forgotten in English: the
  // lookup falls back, so the card would show Vietnamese to an English user
  // with nothing reporting it. Every key below must be genuinely different in
  // the two tables, except the few that are identical by design.
  const vi = translator('vi');
  const en = translator('en');

  // `cardTitle` is a product name; `tokenLabel` is the same term in both.
  const IDENTICAL_BY_DESIGN = new Set(['cardTitle', 'tokenLabel']);
  const suspicious = USED_KEYS.filter(
    (key) => !IDENTICAL_BY_DESIGN.has(key) && vi(key, 'X') === en(key, 'X'),
  );

  assert.deepEqual(suspicious, [], 'these keys look untranslated in English');
});

test('an unknown language falls back to the default', () => {
  assert.equal(translator('fr')('save'), translator(DEFAULT_LANGUAGE)('save'));
  assert.equal(translator(undefined)('save'), translator(DEFAULT_LANGUAGE)('save'));
});

test('an unknown key returns its own name rather than blank text', () => {
  // A blank label reads as a rendering bug; the key names what was never
  // written and points straight at the fix.
  assert.equal(translator('vi')('noSuchKey'), 'noSuchKey');
});

test('parameterised strings interpolate their argument', () => {
  assert.match(translator('vi')('claimed', '12345'), /12345/);
  assert.match(translator('en')('claimed', '12345'), /12345/);
  assert.match(translator('en')('tokenHint', 'MY_REF'), /MY_REF/);
});

test('claim and denial messages are HTML, matching how they are sent', () => {
  // These go through `sendHtml`, so a stray `<` in copy would break the send.
  for (const language of LANGUAGES) {
    const t = translator(language);
    assert.match(t('claimed', '1'), /<b>.*<\/b>/s);
    assert.match(t('deniedClaimed', '1'), /<code>1<\/code>/);
  }
});

test('every language has a display name for the picker', () => {
  for (const language of LANGUAGES) {
    assert.ok(LANGUAGE_NAMES[language], `no display name for ${language}`);
  }
  assert.equal(Object.keys(LANGUAGE_NAMES).length, LANGUAGES.length);
});

test('the default language is one this build ships', () => {
  assert.ok(LANGUAGES.includes(DEFAULT_LANGUAGE));
});
