/**
 * Telegram channel settings card.
 *
 * The Plugins settings tab dispatches one slot key per settings namespace the
 * Host serves. This package registers the Host namespace (`lib/settings.js`)
 * and the card below under the same key, and the tab pairs the two without
 * knowing what either means — which is what lets a plugin distributed outside
 * the DSH repository appear on the page at all.
 *
 * Three rules the surrounding machinery imposes, each visible in the code:
 *
 * 1. **A secret never rides the wire.** `describe` strips `role('secret')`
 *    fields, so the bot token cannot be read back and is not part of the
 *    settings section. It is written through the credentials domain instead,
 *    and the card can only ever report *whether* one is configured.
 * 2. **Writes are fenced by revision.** Every descriptor carries the raw
 *    section's revision; a write echoing a stale one is refused rather than
 *    silently overwriting whoever saved first. The card therefore re-reads
 *    after saving and reports a save that did not land.
 * 3. **The Host is the authority on validity.** Its validators own constraints
 *    no schema expresses, so a rejected save keeps the user's drafts for
 *    correction instead of dropping them.
 */

import * as React from 'react';
import {
  IconCheckOutline14,
  IconChevronDownOutline14,
} from '@deepseek-ai/dsh-client-ui-primitives';

import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  LANGUAGE_NAMES,
  translator,
} from '../../lib/i18n.js';
import { ensureStyles, styles } from './styles';

/** The namespace this card edits. Must match `SETTINGS_NAMESPACE` on the Host. */
const NS = 'telegram';

/** Fields that only take effect after DSH restarts, so the card can say so. */
const RESTART_FIELDS = new Set(['tokenRef', 'workspaceRoot', 'enabled']);

type Descriptor = {
  ns: string;
  revision: number;
  value: Record<string, unknown>;
  user: Record<string, unknown>;
  base?: Record<string, unknown>;
};

type Draft = Record<string, string | boolean | string[]>;

/**
 * Read this namespace's descriptor.
 *
 * Returns `undefined` rather than throwing: the page must keep working when
 * the Host is momentarily unreachable, and a card that vanishes is a clearer
 * signal than one showing stale values as if they were live.
 */
async function readDescriptor(api: any): Promise<Descriptor | undefined> {
  try {
    const response = await api.settings.describe({ namespaces: [NS] });
    if (!response?.result?.ok) return undefined;
    const found = response.result.value.namespaces.find((view: any) => view.ns === NS);
    return found as Descriptor | undefined;
  } catch {
    return undefined;
  }
}

function TelegramCard(props: any) {
  // Only `api` is destructured: it is what this card's registration injects.
  // Copy is written inline rather than read from a `t` prop, because this
  // plugin registers no locale dictionary — reaching for one that was never
  // registered is how the entry ended up pending in the first place.
  const { api } = props;
  const [open, setOpen] = React.useState(false);
  const [descriptor, setDescriptor] = React.useState<Descriptor | undefined>();
  const [draft, setDraft] = React.useState<Draft>({});
  const [token, setToken] = React.useState('');
  const [tokenConfigured, setTokenConfigured] = React.useState<boolean | undefined>();
  const [status, setStatus] = React.useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  const tokenRef = String(
    (draft.tokenRef as string) ?? descriptor?.value?.tokenRef ?? 'TELEGRAM_BOT_TOKEN',
  );

  // The staged language wins over the saved one, so the card re-labels itself
  // as soon as the picker moves rather than only after a save. Seeing the
  // result before committing is the whole point of a language control.
  const language = String(
    (draft.language as string) ?? descriptor?.value?.language ?? DEFAULT_LANGUAGE,
  );
  const t = translator(language);

  /** Load the section, and whether a token is stored for the reference it names. */
  const reload = React.useCallback(async () => {
    const next = await readDescriptor(api);
    if (next) setDescriptor(next);

    const ref = String(next?.value?.tokenRef ?? 'TELEGRAM_BOT_TOKEN');
    try {
      const response = await api.credentials.describe({ refs: [ref] });
      if (response?.result?.ok) {
        setTokenConfigured(Boolean(response.result.value.credentials?.[ref]?.configured));
      }
    } catch {
      setTokenConfigured(undefined);
    }
  }, [api]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const value = <T,>(key: string, fallback: T): T =>
    (draft[key] as T) ?? (descriptor?.value?.[key] as T) ?? fallback;

  /** `allowedUsers` is stored as an array but edited as one comma-separated line. */
  const textValue = (key: string): string => {
    const raw = draft[key] ?? descriptor?.value?.[key];
    if (Array.isArray(raw)) return raw.join(', ');
    return raw === undefined || raw === null ? '' : String(raw);
  };

  const edit = (key: string, next: string | boolean | string[]) => {
    setDraft((prev) => ({ ...prev, [key]: next }));
    setStatus('idle');
  };

  const dirty = Object.keys(draft).length > 0 || token.length > 0;
  const needsRestart = Object.keys(draft).some((key) => RESTART_FIELDS.has(key));

  const save = async () => {
    setStatus('saving');

    // The token is a credential, not a setting: write it through its own
    // domain, and only when the user actually typed one. A blank draft must
    // leave a stored key alone rather than erasing it.
    if (token) {
      try {
        await api.credentials.set({ ref: tokenRef, value: token });
        setToken('');
      } catch {
        setStatus('failed');
        return;
      }
    }

    const section = normalizeSection(draft);
    if (Object.keys(section).length > 0) {
      try {
        const response = await api.settings.update({
          ns: NS,
          section,
          expectedRevision: descriptor?.revision,
        });
        if (!response?.result?.ok) {
          // A stale revision or a rejected value: keep the drafts so the user
          // can correct them, and re-read so the next attempt is fenced right.
          setStatus('failed');
          await reload();
          return;
        }
      } catch {
        setStatus('failed');
        return;
      }
    }

    setDraft({});
    await reload();
    setStatus('saved');
  };

  const discard = () => {
    setDraft({});
    setToken('');
    setStatus('idle');
  };

  const overridden = (key: string) => descriptor?.user?.[key] !== undefined;

  const resetField = async (key: string) => {
    // Removing an override is a targeted unset: rebuilding the section from a
    // redacted read and replacing it wholesale would delete anything the wire
    // never returned.
    try {
      await api.settings.mutate({
        ns: NS,
        ops: [{ op: 'unset', path: key }],
        expectedRevision: descriptor?.revision,
      });
    } catch {
      setStatus('failed');
      return;
    }
    setDraft((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    await reload();
  };

  const field = (key: string, label: string, hint?: string) => (
    <div className={styles.field} key={key}>
      <div className={styles.labelRow}>
        <label className={styles.label} htmlFor={`telegram-${key}`}>
          {label}
        </label>
        {overridden(key) ? (
          <button type="button" className={styles.reset} onClick={() => void resetField(key)}>
            {t('reset')}
          </button>
        ) : null}
      </div>
      <input
        id={`telegram-${key}`}
        className={styles.input}
        value={textValue(key)}
        onChange={(event) => edit(key, event.target.value)}
      />
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  );

  const toggle = (key: string, label: string, hint?: string) => (
    <div className={styles.field} key={key}>
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={Boolean(value(key, true))}
          onChange={(event) => edit(key, event.target.checked)}
        />
        <span>{label}</span>
      </label>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  );

  // The tab renders cards into a list, and the built-in card is an <li> with a
  // header button that expands it. Matching that shape is not decoration: a
  // card that stays permanently open pushes its neighbours off screen and
  // reads as a rendering fault next to the ones that collapse.
  return (
    <li className={open ? `${styles.card} ${styles.cardOpen}` : styles.card}>
      <button
        type="button"
        className={styles.header}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className={styles.headText}>
          <span className={styles.name}>{t('cardTitle')}</span>
          <span className={styles.description}>{t('cardDescription')}</span>
        </span>
        {dirty ? <span className={styles.pending}>{t('unsaved')}</span> : null}
        <IconChevronDownOutline14
          className={open ? `${styles.chevron} ${styles.chevronOpen}` : styles.chevron}
        />
      </button>

      {open ? (
        <div className={styles.body}>
          <div className={styles.field}>
            <div className={styles.labelRow}>
              <label className={styles.label} htmlFor="telegram-token">
                {t('tokenLabel')}
              </label>
              {/* A configured token needs no words: the tick alone reads at a
                  glance, and the label beside it already says what it is. The
                  unset states still need naming, so they keep their text. */}
              {tokenConfigured ? (
                <span
                  className={`${styles.badge} ${styles.badgeOk}`}
                  title={t('tokenConfigured')}
                  aria-label={t('tokenConfigured')}
                >
                  <IconCheckOutline14 className={styles.badgeIcon} />
                </span>
              ) : (
                <span className={styles.badge}>
                  {tokenConfigured === undefined ? t('tokenUnknown') : t('tokenMissing')}
                </span>
              )}
            </div>
            <input
              id="telegram-token"
              className={styles.input}
              type="password"
              autoComplete="off"
              placeholder={
                tokenConfigured ? t('tokenPlaceholderSet') : t('tokenPlaceholderEmpty')
              }
              value={token}
              onChange={(event) => {
                setToken(event.target.value);
                setStatus('idle');
              }}
            />
            <p className={styles.hint}>{t('tokenHint', tokenRef)}</p>
          </div>

          <div className={styles.field}>
            <div className={styles.labelRow}>
              <label className={styles.label} htmlFor="telegram-language">
                {t('languageLabel')}
              </label>
              {overridden('language') ? (
                <button
                  type="button"
                  className={styles.reset}
                  onClick={() => void resetField('language')}
                >
                  {t('reset')}
                </button>
              ) : null}
            </div>
            <select
              id="telegram-language"
              className={styles.select}
              value={language}
              onChange={(event) => edit('language', event.target.value)}
            >
              {LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {LANGUAGE_NAMES[code]}
                </option>
              ))}
            </select>
            <p className={styles.hint}>{t('languageHint')}</p>
          </div>

          {toggle('enabled', t('enabledLabel'))}
          {field('allowedUsers', t('allowedLabel'), t('allowedHint'))}
          {field('workspaceRoot', t('workspaceLabel'), t('workspaceHint'))}

          {needsRestart ? <p className={styles.warning}>{t('restartNotice')}</p> : null}

          <div className={styles.footer}>
            {status === 'saved' ? <span className={styles.status}>{t('saved')}</span> : null}
            {status === 'failed' ? (
              <span className={styles.error}>{t('saveFailed')}</span>
            ) : null}
            <button
              type="button"
              className={styles.btn}
              disabled={!dirty || status === 'saving'}
              onClick={discard}
            >
              {t('discard')}
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={!dirty || status === 'saving'}
              onClick={() => void save()}
            >
              {status === 'saving' ? t('saving') : t('save')}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/**
 * `allowedUsers` is an array on the Host but a comma-separated line in the UI,
 * because a list of numeric ids is faster to edit as text than as rows. The
 * conversion lives at the boundary so the rest of the card handles one shape.
 */
function normalizeSection(section: Draft): Record<string, unknown> {
  const out: Record<string, unknown> = { ...section };
  if (typeof out.allowedUsers === 'string') {
    out.allowedUsers = out.allowedUsers
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return out;
}

export const inject = ['slots', 'connection'];

export function apply(ctx: any) {
  const { api } = ctx.get('connection');
  ensureStyles();

  ctx.slots.inject('settings.plugin.item', function* () {
    yield ctx.slots.register(
      {
        name: 'settings.plugin.item',
        key: NS,
        inject: () => ({ api }),
      },
      TelegramCard,
    );
  });
}

export { normalizeSection };
