# dsh-telegram

A Telegram channel for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

Written to fix four concrete failures of the generic channel bridge:

| Problem | Cause | Fix |
|---|---|---|
| Bold, links and tables render as literal markdown | `parse_mode` was never set | Markdown is compiled to Telegram HTML, with tables laid out as aligned monospace |
| The agent cannot send images | the reply path only ever passed `{ text }` | file references in a reply become real `sendPhoto` / `sendDocument` uploads |
| Questions have no answer buttons | no `UserQuestionProvider` was registered | questions render as inline keyboards, with multi-select and free-text answers |
| No way to change model from chat | only `/new` existed | `/model`, `/preset`, `/mode`, `/status`, `/stop`, `/compact` |

## Install

```sh
cd $DSH_HOME/profiles/web
pnpm add file:/path/to/dsh-telegram
```

Add the bundle to the profile's `package.json`:

```json
{
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-telegram"]
    }
  }
}
```

Store the bot token — it is never read from plugin config:

```sh
# $DSH_HOME/.credentials.yaml
TELEGRAM_BOT_TOKEN: "123456:ABC-DEF..."
```

Or paste it into **Settings → Plugins → Telegram** once the profile is running.

## Settings page

The plugin registers the `telegram` settings namespace and ships a browser card
keyed on it, so the bot token, the allowed-user list, the working directory and
the display switches are editable from Settings → Plugins without touching a
file.

Two behaviours are worth knowing:

- **The token is not stored in the settings document.** Secrets are stripped
  from every wire response, so the card can only report *whether* a token is
  configured, never show one. It writes through the credentials domain, and a
  blank field leaves the stored token alone.
- **Not every change applies live.** The allowed-user list and the display
  switches take effect on the next message. The token reference, the working
  directory and the on/off switch are read when the channel starts, so they
  apply after DSH restarts — the card says so before you save, and the log
  repeats it afterwards.

Values pinned in the profile's `cordis.patch.yml` become the namespace's `base`
layer, so a deployment's choice survives until a user deliberately overrides it,
and **Reset** on a field returns it to that value.

## Building from source

The Host half is plain ESM JavaScript and runs as-is. The browser half is the
one build step, because DSH's page loader takes a registered CJS factory rather
than an ES module:

```sh
npm install
npm run build:client   # emits lib/client.js
npm test
```

`prepublishOnly` runs both, so a published tarball always carries a bundle that
matches its source. React and the DSH client packages stay external `require`
calls resolved by the page — bundling React would give the card a second React
instance and break its hooks at runtime.

> The upstream `clientBundle` build preset is not published, so `tsdown.client.ts`
> here reproduces its contract. This is a known gap in the out-of-repo plugin
> story, documented in `dsh-client-ui-settings-plugins`' own README.

## Commands

| Command | Effect |
|---|---|
| `/new` | Start a fresh session for this chat |
| `/model` | Pick a provider/model from buttons, or `/model provider/model` |
| `/preset` | Choose the agent preset used by the next session |
| `/mode` | Set the sandbox mode (`read-only`, `workspace-write`, `danger-full-access`) |
| `/status` | Session id, model, preset, sandbox mode, working directory |
| `/stop` | Cancel the running turn |
| `/compact` | Compact conversation history |
| `/help` | List commands |

## Configuration

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Turn the channel off without removing it |
| `tokenRef` | `TELEGRAM_BOT_TOKEN` | Credential name holding the bot token |
| `allowedUsers` | `[]` | Telegram user ids allowed to talk to the bot; empty allows everyone |
| `workspaceRoot` | `process.cwd()` | Working directory for channel sessions |
| `streaming` | `true` | Edit one message in place while the answer streams |
| `showToolActivity` | `true` | Show which tool is running inside the preview |
| `rich` | `true` | Use real tables and lists (`sendRichMessage`) |
| `preset` | — | Agent preset for new channel sessions |
| `bindingFile` | `$DSH_HOME/dsh-telegram/bindings.json` | Where the chat→session map lives |

Everything above except `preset` and `bindingFile` is also user-editable from
the Settings page; those two stay deployment concerns, since pointing the
channel at an unwritable binding file would break it with no way back.

## Design notes

**Escaping happens once.** Raw text is HTML-escaped up front; inline patterns
then run against the escaped text. Because escaping removes every `<` and `>`,
no user content can forge a tag. Code spans and fences are lifted out before
escaping and restored after, so their contents never see emphasis processing.

**Chunking splits the source, not the HTML.** Slicing rendered HTML at 4096
bytes would cut a message mid-tag and Telegram would reject the whole send.
Splitting markdown and rendering each piece guarantees balanced tags, and a
fence spanning a boundary is closed and reopened.

**Media never escapes the workspace.** A referenced path is resolved against
the session's workspace root and rejected if it lands outside; the reference
stays as text rather than uploading an arbitrary file.

**HTML failure degrades, never drops.** If Telegram rejects a rendered payload,
the client retries once as plain text. A formatting bug costs formatting, not
the message.

**Only channel-owned turns are delivered.** A session can also be driven from
the Web UI. The reply router tracks which turns it opened so those replies are
not duplicated into the chat.

## Tests

```sh
node --test 'test/*.test.js'
```

Covers the renderer (escaping, emphasis, tables, chunk balance, injection
attempts) and media extraction (classification, workspace confinement,
deduplication, album grouping) without contacting Telegram.
