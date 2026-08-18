window.__ModuleLoader__.load({
	id: "dsh-telegram",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/styles.ts
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
		function ensureStyles() {
			if (typeof document === "undefined") return;
			const marker = "dsh-telegram-card";
			if (document.querySelector(`style[data-plugin-css="${marker}"]`)) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-telegram";
			tag.dataset.pluginCss = marker;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}
		const styles = {
			card: "dshtg_card",
			cardOpen: "dshtg_cardOpen",
			header: "dshtg_header",
			headText: "dshtg_headText",
			name: "dshtg_name",
			description: "dshtg_description",
			chevron: "dshtg_chevron",
			chevronOpen: "dshtg_chevronOpen",
			pending: "dshtg_pending",
			body: "dshtg_body",
			field: "dshtg_field",
			labelRow: "dshtg_labelRow",
			label: "dshtg_label",
			badge: "dshtg_badge",
			badgeOk: "dshtg_badgeOk",
			badgeIcon: "dshtg_badgeIcon",
			reset: "dshtg_reset",
			input: "dshtg_input",
			hint: "dshtg_hint",
			toggle: "dshtg_toggle",
			warning: "dshtg_warning",
			footer: "dshtg_footer",
			status: "dshtg_status",
			error: "dshtg_error",
			btn: "dshtg_btn",
			btnPrimary: "dshtg_btnPrimary",
			code: "dshtg_code"
		};
		//#endregion
		//#region src/client/index.tsx
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
		/** The namespace this card edits. Must match `SETTINGS_NAMESPACE` on the Host. */
		const NS = "telegram";
		/** Fields that only take effect after DSH restarts, so the card can say so. */
		const RESTART_FIELDS = /* @__PURE__ */ new Set([
			"tokenRef",
			"workspaceRoot",
			"enabled"
		]);
		/**
		* Read this namespace's descriptor.
		*
		* Returns `undefined` rather than throwing: the page must keep working when
		* the Host is momentarily unreachable, and a card that vanishes is a clearer
		* signal than one showing stale values as if they were live.
		*/
		async function readDescriptor(api) {
			try {
				const response = await api.settings.describe({ namespaces: [NS] });
				if (!response?.result?.ok) return void 0;
				return response.result.value.namespaces.find((view) => view.ns === NS);
			} catch {
				return;
			}
		}
		function TelegramCard(props) {
			const { api } = props;
			const [open, setOpen] = react.useState(false);
			const [descriptor, setDescriptor] = react.useState();
			const [draft, setDraft] = react.useState({});
			const [token, setToken] = react.useState("");
			const [tokenConfigured, setTokenConfigured] = react.useState();
			const [status, setStatus] = react.useState("idle");
			const tokenRef = String(draft.tokenRef ?? descriptor?.value?.tokenRef ?? "TELEGRAM_BOT_TOKEN");
			/** Load the section, and whether a token is stored for the reference it names. */
			const reload = react.useCallback(async () => {
				const next = await readDescriptor(api);
				if (next) setDescriptor(next);
				const ref = String(next?.value?.tokenRef ?? "TELEGRAM_BOT_TOKEN");
				try {
					const response = await api.credentials.describe({ refs: [ref] });
					if (response?.result?.ok) setTokenConfigured(Boolean(response.result.value.credentials?.[ref]?.configured));
				} catch {
					setTokenConfigured(void 0);
				}
			}, [api]);
			react.useEffect(() => {
				reload();
			}, [reload]);
			const value = (key, fallback) => draft[key] ?? descriptor?.value?.[key] ?? fallback;
			/** `allowedUsers` is stored as an array but edited as one comma-separated line. */
			const textValue = (key) => {
				const raw = draft[key] ?? descriptor?.value?.[key];
				if (Array.isArray(raw)) return raw.join(", ");
				return raw === void 0 || raw === null ? "" : String(raw);
			};
			const edit = (key, next) => {
				setDraft((prev) => ({
					...prev,
					[key]: next
				}));
				setStatus("idle");
			};
			const dirty = Object.keys(draft).length > 0 || token.length > 0;
			const needsRestart = Object.keys(draft).some((key) => RESTART_FIELDS.has(key));
			const save = async () => {
				setStatus("saving");
				if (token) try {
					await api.credentials.set({
						ref: tokenRef,
						value: token
					});
					setToken("");
				} catch {
					setStatus("failed");
					return;
				}
				const section = normalizeSection(draft);
				if (Object.keys(section).length > 0) try {
					if (!(await api.settings.update({
						ns: NS,
						section,
						expectedRevision: descriptor?.revision
					}))?.result?.ok) {
						setStatus("failed");
						await reload();
						return;
					}
				} catch {
					setStatus("failed");
					return;
				}
				setDraft({});
				await reload();
				setStatus("saved");
			};
			const discard = () => {
				setDraft({});
				setToken("");
				setStatus("idle");
			};
			const overridden = (key) => descriptor?.user?.[key] !== void 0;
			const resetField = async (key) => {
				try {
					await api.settings.mutate({
						ns: NS,
						ops: [{
							op: "unset",
							path: key
						}],
						expectedRevision: descriptor?.revision
					});
				} catch {
					setStatus("failed");
					return;
				}
				setDraft((prev) => {
					const next = { ...prev };
					delete next[key];
					return next;
				});
				await reload();
			};
			const field = (key, label, hint) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: styles.field,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles.labelRow,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							className: styles.label,
							htmlFor: `telegram-${key}`,
							children: label
						}), overridden(key) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: styles.reset,
							onClick: () => void resetField(key),
							children: "Đặt lại"
						}) : null]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						id: `telegram-${key}`,
						className: styles.input,
						value: textValue(key),
						onChange: (event) => edit(key, event.target.value)
					}),
					hint ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: styles.hint,
						children: hint
					}) : null
				]
			}, key);
			const toggle = (key, label, hint) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: styles.field,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
					className: styles.toggle,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						type: "checkbox",
						checked: Boolean(value(key, true)),
						onChange: (event) => edit(key, event.target.checked)
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label })]
				}), hint ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: styles.hint,
					children: hint
				}) : null]
			}, key);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: open ? `${styles.card} ${styles.cardOpen}` : styles.card,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: styles.header,
					"aria-expanded": open,
					onClick: () => setOpen(!open),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: styles.headText,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: styles.name,
								children: "Telegram"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: styles.description,
								children: "Kênh Telegram: gửi ảnh, bảng thật, câu hỏi có nút bấm, đổi model trong chat."
							})]
						}),
						dirty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: styles.pending,
							children: "chưa lưu"
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: open ? `${styles.chevron} ${styles.chevronOpen}` : styles.chevron })
					]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: styles.body,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: styles.field,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: styles.labelRow,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
										className: styles.label,
										htmlFor: "telegram-token",
										children: "Bot token"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: tokenConfigured ? `${styles.badge} ${styles.badgeOk}` : styles.badge,
										children: [tokenConfigured ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutline14, { className: styles.badgeIcon }) : null, tokenConfigured === void 0 ? "không rõ" : tokenConfigured ? "đã cấu hình" : "chưa có"]
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									id: "telegram-token",
									className: styles.input,
									type: "password",
									autoComplete: "off",
									placeholder: tokenConfigured ? "Đã lưu — nhập để thay" : "Dán token từ @BotFather",
									value: token,
									onChange: (event) => {
										setToken(event.target.value);
										setStatus("idle");
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
									className: styles.hint,
									children: [
										"Token nằm trong kho credential ",
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: styles.code,
											children: tokenRef
										}),
										", không nằm trong file cấu hình. Để trống nghĩa là giữ token đang có."
									]
								})
							]
						}),
						toggle("enabled", "Bật kênh Telegram"),
						field("allowedUsers", "User được phép dùng bot", "Telegram user id, cách nhau bởi dấu phẩy. Để trống nghĩa là ai cũng dùng được."),
						field("workspaceRoot", "Thư mục làm việc", "Nơi agent chạy lệnh và đọc ghi file."),
						needsRestart ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: styles.warning,
							children: "Token, thư mục làm việc và công tắc bật/tắt chỉ có hiệu lực sau khi khởi động lại DSH."
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: styles.footer,
							children: [
								status === "saved" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: styles.status,
									children: "Đã lưu"
								}) : null,
								status === "failed" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: styles.error,
									children: "Lưu không thành công — kiểm tra lại giá trị"
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: styles.btn,
									disabled: !dirty || status === "saving",
									onClick: discard,
									children: "Huỷ"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: `${styles.btn} ${styles.btnPrimary}`,
									disabled: !dirty || status === "saving",
									onClick: () => void save(),
									children: status === "saving" ? "Đang lưu…" : "Lưu"
								})
							]
						})
					]
				}) : null]
			});
		}
		/**
		* `allowedUsers` is an array on the Host but a comma-separated line in the UI,
		* because a list of numeric ids is faster to edit as text than as rows. The
		* conversion lives at the boundary so the rest of the card handles one shape.
		*/
		function normalizeSection(section) {
			const out = { ...section };
			if (typeof out.allowedUsers === "string") out.allowedUsers = out.allowedUsers.split(",").map((entry) => entry.trim()).filter(Boolean);
			return out;
		}
		const inject = ["slots", "connection"];
		function apply(ctx) {
			const { api } = ctx.get("connection");
			ensureStyles();
			ctx.slots.inject("settings.plugin.item", function* () {
				yield ctx.slots.register({
					name: "settings.plugin.item",
					key: NS,
					inject: () => ({ api })
				}, TelegramCard);
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.normalizeSection = normalizeSection;
		return module.exports;
	}
});
