/**
 * Card styling.
 *
 * The bundle-purity rule forbids importing the settings section's own card
 * chrome as a value, so a plugin shipping a card owns its appearance. That is
 * a real constraint, not an invitation to invent a look: a card that does not
 * match the ones beside it reads as broken, and the first version of this card
 * did — flat text where every neighbour had a bordered, collapsible shell.
 *
 * So these rules mirror the built-in `PluginCard` structurally and use only
 * `--dsw-alias-*` design tokens, never literal colours. Tokens are what make
 * the card follow the light/dark/system switch in General settings; a
 * hard-coded `#1a1a1a` would look right in dark mode and be unreadable in
 * light.
 *
 * Class names carry a `dshtg_` prefix in place of the build-time CSS-module
 * hash, so they cannot collide with another plugin's card.
 */

const CSS = `
.dshtg_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}
.dshtg_card:hover{border-color:var(--dsw-alias-label-dimmed)}
.dshtg_cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}
.dshtg_header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}
.dshtg_header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dshtg_headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}
.dshtg_name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}
.dshtg_description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}
.dshtg_chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}
.dshtg_chevronOpen{transform:rotate(180deg)}
.dshtg_pending{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:12px}
.dshtg_body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}
.dshtg_field{flex-direction:column;gap:6px;padding:14px 0;display:flex;border-bottom:1px solid var(--dsw-alias-border-l2)}
.dshtg_field:last-of-type{border-bottom:0}
.dshtg_labelRow{align-items:center;gap:8px;display:flex}
.dshtg_label{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;flex:1}
.dshtg_badge{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;align-items:center;gap:4px;padding:1px 8px;font-size:12px;display:inline-flex}
.dshtg_badgeOk{background:var(--dsw-alias-state-success-secondary);color:var(--dsw-alias-state-success-primary)}
.dshtg_badgeIcon{flex:none}
.dshtg_reset{appearance:none;font:inherit;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;padding:0;font-size:12px;text-decoration:underline}
.dshtg_reset:hover{color:var(--dsw-alias-label-primary)}
.dshtg_input{width:100%;box-sizing:border-box;font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:7px 10px;font-size:13px}
.dshtg_input:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}
.dshtg_input:disabled{opacity:.6;cursor:not-allowed}
.dshtg_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}
.dshtg_toggle{align-items:center;gap:8px;cursor:pointer;display:flex;font-size:13px;color:var(--dsw-alias-label-primary)}
.dshtg_warning{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-module-platform);border-radius:8px;margin:12px 0 0;padding:8px 10px;font-size:12px;line-height:1.5}
.dshtg_footer{justify-content:flex-end;align-items:center;gap:10px;padding:12px 0 4px;display:flex}
.dshtg_status{margin-right:auto;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.dshtg_error{margin-right:auto;font-size:12px;color:var(--dsw-alias-state-error-primary,var(--dsw-alias-label-secondary))}
.dshtg_btn{appearance:none;font:inherit;cursor:pointer;border-radius:8px;padding:6px 14px;font-size:13px;border:1px solid var(--dsw-alias-border-l2);background:0 0;color:var(--dsw-alias-label-primary)}
.dshtg_btn:disabled{opacity:.5;cursor:not-allowed}
.dshtg_btnPrimary{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-1);border-color:transparent}
.dshtg_code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
`;

/**
 * Inject the stylesheet once per page.
 *
 * Module bodies run at materialization, and a plugin can be loaded again after
 * a retract, so this guards on a marker attribute rather than a module-level
 * boolean — a second copy of the rules would be harmless but the duplicate
 * `<style>` tags accumulate across reloads.
 */
export function ensureStyles(): void {
  if (typeof document === 'undefined') return;
  const marker = 'dsh-telegram-card';
  if (document.querySelector(`style[data-plugin-css="${marker}"]`)) return;

  const tag = document.createElement('style');
  tag.dataset.plugin = 'dsh-telegram';
  tag.dataset.pluginCss = marker;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}

export const styles = {
  card: 'dshtg_card',
  cardOpen: 'dshtg_cardOpen',
  header: 'dshtg_header',
  headText: 'dshtg_headText',
  name: 'dshtg_name',
  description: 'dshtg_description',
  chevron: 'dshtg_chevron',
  chevronOpen: 'dshtg_chevronOpen',
  pending: 'dshtg_pending',
  body: 'dshtg_body',
  field: 'dshtg_field',
  labelRow: 'dshtg_labelRow',
  label: 'dshtg_label',
  badge: 'dshtg_badge',
  badgeOk: 'dshtg_badgeOk',
  badgeIcon: 'dshtg_badgeIcon',
  reset: 'dshtg_reset',
  input: 'dshtg_input',
  hint: 'dshtg_hint',
  toggle: 'dshtg_toggle',
  warning: 'dshtg_warning',
  footer: 'dshtg_footer',
  status: 'dshtg_status',
  error: 'dshtg_error',
  btn: 'dshtg_btn',
  btnPrimary: 'dshtg_btnPrimary',
  code: 'dshtg_code',
};
