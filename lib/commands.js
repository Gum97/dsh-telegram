/**
 * In-chat control commands.
 *
 * These are handled by the channel itself rather than registered with
 * `ctx.commands`, because they must work before an agent exists (`/new` on a
 * fresh chat) and they answer through Telegram's own affordances — inline
 * keyboards for choices instead of a text prompt.
 *
 * `/model` and `/preset` present their choices as buttons; the selection is
 * applied through the same seams the Web UI uses:
 *   - model  -> `ModelSelectionRef.current` on the live agent (+ optional default save)
 *   - mode   -> a `sandbox/mode` session event
 *   - preset -> recorded for the next session (a live agent cannot swap presets)
 */

import { escapeHtml } from './markdown.js';

/** Sandbox modes offered by `/mode`, in increasing order of permission. */
const SANDBOX_MODES = [
  { id: 'read-only', label: '🔒 Chỉ đọc', description: 'Không cho ghi file' },
  { id: 'workspace-write', label: '📝 Ghi trong workspace', description: 'Ghi được trong thư mục làm việc' },
  { id: 'danger-full-access', label: '⚠️ Toàn quyền', description: 'Ghi mọi nơi — cân nhắc kỹ' },
];

export const COMMAND_MENU = [
  { command: 'start', description: 'Bắt đầu dùng bot' },
  { command: 'new', description: 'Bắt đầu phiên trò chuyện mới' },
  { command: 'model', description: 'Xem và đổi model đang dùng' },
  { command: 'preset', description: 'Đổi chế độ agent cho phiên mới' },
  { command: 'mode', description: 'Đổi quyền ghi file (sandbox)' },
  { command: 'status', description: 'Trạng thái phiên hiện tại' },
  { command: 'stop', description: 'Dừng lượt đang chạy' },
  { command: 'compact', description: 'Nén lịch sử hội thoại' },
  { command: 'clear', description: 'Xoá lịch sử và bắt đầu lại' },
  { command: 'help', description: 'Danh sách lệnh' },
];

export class TelegramCommands {
  /**
   * @param {{
   *   api: any, ctx: any, logger?: any,
   *   bindings: any, sessions: any,
   *   startNewSession: Function,
   *   getAgent: Function,
   * }} options
   */
  constructor(options) {
    this.api = options.api;
    this.ctx = options.ctx;
    this.logger = options.logger ?? console;
    this.bindings = options.bindings;
    this.startNewSession = options.startNewSession;
    this.getAgent = options.getAgent;
    /** token -> pending choice state, addressed by inline-keyboard callbacks. */
    this.pending = new Map();
  }

  /** Parse `/name rest` including the `/name@botusername` form Telegram uses in groups. */
  static parse(text) {
    const match = /^\/([a-zA-Z][a-zA-Z0-9_]*)(?:@[\w_]+)?(?:\s+([\s\S]*))?$/.exec(String(text).trim());
    if (!match) return undefined;
    return { name: match[1].toLowerCase(), rest: (match[2] ?? '').trim() };
  }

  /**
   * Execute a command. Returns true when it was handled (and therefore must
   * not reach the agent).
   */
  async handle(command, target) {
    const handler = this[`cmd_${command.name}`];
    if (typeof handler !== 'function') return false;
    try {
      await handler.call(this, command, target);
    } catch (error) {
      this.logger.error?.(`[dsh-telegram] /${command.name} failed`, String(error));
      await this.reply(target, `⚠️ Lệnh <code>/${escapeHtml(command.name)}</code> lỗi: ${escapeHtml(String(error))}`);
    }
    return true;
  }

  reply(target, html, keyboard) {
    return this.api.sendHtml(target.chatId, html, { threadId: target.threadId, keyboard });
  }

  /* ------------------------------------------------------------------ */

  async cmd_help(command, target) {
    const lines = [
      '<b>Các lệnh khả dụng</b>',
      '',
      ...COMMAND_MENU.map((entry) => `/${entry.command} — ${escapeHtml(entry.description)}`),
      '',
      '<i>Gửi tin nhắn thường để trò chuyện với agent. Ảnh và file bạn gửi sẽ được agent đọc.</i>',
    ];
    await this.reply(target, lines.join('\n'));
  }

  async cmd_start(command, target) {
    await this.reply(
      target,
      [
        '<b>Xin chào! 👋</b>',
        '',
        'Mình là agent DeepSeek Harness chạy qua Telegram.',
        'Cứ nhắn tin bình thường để bắt đầu, hoặc gõ /help để xem các lệnh.',
      ].join('\n'),
    );
  }

  async cmd_new(command, target) {
    const sessionId = await this.startNewSession(target, command.rest);
    await this.reply(
      target,
      `🆕 Đã mở phiên mới.\n<code>${escapeHtml(String(sessionId).slice(0, 20))}</code>`,
    );
  }

  async cmd_clear(command, target) {
    return this.cmd_new(command, target);
  }

  async cmd_status(command, target) {
    const binding = await this.bindings.get(target.key);
    if (!binding) {
      await this.reply(target, 'Chưa có phiên nào. Nhắn tin bất kỳ để bắt đầu.');
      return;
    }
    const agent = this.getAgent(binding.sessionId);
    const selection = this.currentSelection(agent);
    const preset = binding.preset ?? '(mặc định)';
    const mode = binding.sandboxMode ?? this.defaultSandboxMode() ?? '(mặc định)';

    const lines = [
      '<b>Trạng thái phiên</b>',
      '',
      `Phiên: <code>${escapeHtml(String(binding.sessionId).slice(0, 24))}</code>`,
      `Trạng thái: ${agent ? (agent.status === 'running' ? '🟢 đang chạy' : '⚪️ rảnh') : '💤 chưa nạp'}`,
      `Model: <code>${escapeHtml(selection ? `${selection.provider}/${selection.model}` : 'không rõ')}</code>`,
      `Chế độ agent: <code>${escapeHtml(preset)}</code>`,
      `Quyền file: <code>${escapeHtml(mode)}</code>`,
      `Thư mục: <code>${escapeHtml(binding.cwd ?? '(mặc định)')}</code>`,
    ];
    await this.reply(target, lines.join('\n'));
  }

  async cmd_stop(command, target) {
    const binding = await this.bindings.get(target.key);
    const agent = binding && this.getAgent(binding.sessionId);
    if (!agent) {
      await this.reply(target, 'Không có lượt nào đang chạy.');
      return;
    }
    agent.cancel('user-interrupt');
    await this.reply(target, '⏹ Đã yêu cầu dừng lượt hiện tại.');
  }

  async cmd_compact(command, target) {
    const compaction = this.ctx.get('compaction');
    if (!compaction) {
      await this.reply(target, 'Bản cài đặt này không có dịch vụ nén hội thoại.');
      return;
    }
    const binding = await this.bindings.get(target.key);
    const agent = binding && this.getAgent(binding.sessionId);
    if (!agent) {
      await this.reply(target, 'Chưa có phiên đang hoạt động để nén.');
      return;
    }
    await this.reply(target, '🗜 Đang nén lịch sử…');
    const controller = new AbortController();
    const result = await compaction.compactNow(agent, controller.signal);
    await this.reply(
      target,
      result ? '✅ Đã nén xong lịch sử hội thoại.' : 'Lịch sử chưa đủ dài để cần nén.',
    );
  }

  /* ---------------------------- model ------------------------------ */

  async cmd_model(command, target) {
    const llm = this.ctx.get('llm');
    if (!llm) {
      await this.reply(target, 'Bản cài đặt này không có dịch vụ LLM.');
      return;
    }

    // `/model provider/model` applies directly, skipping the picker.
    if (command.rest) {
      await this.applyModel(target, command.rest);
      return;
    }

    const providers = llm.listProviders();
    const choices = [];
    for (const provider of providers) {
      let models = [];
      try {
        models = await llm.listModels(provider.id);
      } catch (error) {
        this.logger.warn?.(`[dsh-telegram] listModels(${provider.id}) failed`, String(error));
      }
      for (const model of models) {
        choices.push({ provider: provider.id, model: model.id, label: `${provider.displayName ?? provider.id} · ${model.name ?? model.id}` });
      }
      if (models.length === 0) {
        choices.push({ provider: provider.id, model: undefined, label: `${provider.displayName ?? provider.id} · (nhập tên model)` });
      }
    }

    if (choices.length === 0) {
      await this.reply(target, 'Không tìm thấy provider nào đã đăng ký.');
      return;
    }

    const binding = await this.bindings.get(target.key);
    const agent = binding && this.getAgent(binding.sessionId);
    const current = this.currentSelection(agent);
    const token = this.stash({ kind: 'model', choices, target });

    const keyboard = choices.slice(0, 40).map((choice, index) => [
      {
        text:
          current && current.provider === choice.provider && current.model === choice.model
            ? `✅ ${choice.label}`
            : choice.label,
        callback_data: `c:${token}:${index}`,
      },
    ]);

    await this.reply(
      target,
      [
        '<b>Chọn model</b>',
        '',
        current
          ? `Hiện tại: <code>${escapeHtml(`${current.provider}/${current.model}`)}</code>`
          : 'Chưa xác định model hiện tại.',
        '',
        '<i>Hoặc gõ: /model provider/model</i>',
      ].join('\n'),
      keyboard,
    );
  }

  async applyModel(target, spec) {
    const separator = spec.indexOf('/');
    const provider = separator > 0 ? spec.slice(0, separator) : undefined;
    const model = separator > 0 ? spec.slice(separator + 1) : spec;
    if (!provider || !model) {
      await this.reply(target, 'Cú pháp: <code>/model provider/model</code>');
      return;
    }
    await this.selectModel(target, provider, model);
  }

  async selectModel(target, provider, model) {
    const llm = this.ctx.get('llm');
    let resolved;
    try {
      resolved = await llm.resolveCallConfig({ provider, model });
    } catch (error) {
      await this.reply(target, `⚠️ Không dùng được model này: ${escapeHtml(String(error))}`);
      return;
    }

    const selection = { provider: resolved.provider, model: resolved.model };
    const binding = await this.bindings.get(target.key);
    const agent = binding && this.getAgent(binding.sessionId);

    let applied = false;
    if (agent) {
      const ref = this.selectionRefs?.get(agent);
      if (ref) {
        ref.current = selection;
        applied = true;
      }
    }

    // Persist as the default so later sessions inherit it.
    const defaults = this.ctx.get('agentDefaultModel');
    try {
      await defaults?.saveSelection(selection);
    } catch (error) {
      this.logger.warn?.('[dsh-telegram] saving the default model failed', String(error));
    }

    await this.bindings.patch(target.key, { model: selection.model, provider: selection.provider });

    await this.reply(
      target,
      [
        `✅ Model: <code>${escapeHtml(`${selection.provider}/${selection.model}`)}</code>`,
        applied
          ? 'Áp dụng ngay cho phiên này.'
          : 'Sẽ áp dụng từ lượt tiếp theo.',
      ].join('\n'),
    );
  }

  /* ---------------------------- preset ----------------------------- */

  async cmd_preset(command, target) {
    const presets = this.ctx.get('agentPresets');
    if (!presets) {
      await this.reply(target, 'Bản cài đặt này không có chế độ agent (preset).');
      return;
    }

    const available = await presets.list();
    const usable = available.filter((preset) => !preset.broken);
    if (usable.length === 0) {
      await this.reply(target, 'Không có preset khả dụng.');
      return;
    }

    if (command.rest) {
      const chosen = usable.find((preset) => preset.id === command.rest);
      if (!chosen) {
        await this.reply(
          target,
          `Không có preset <code>${escapeHtml(command.rest)}</code>. Các lựa chọn: ${usable.map((p) => p.id).join(', ')}`,
        );
        return;
      }
      await this.applyPreset(target, chosen.id);
      return;
    }

    const binding = await this.bindings.get(target.key);
    const token = this.stash({ kind: 'preset', choices: usable.map((p) => ({ id: p.id, label: p.name ?? p.id })), target });

    const keyboard = usable.map((preset, index) => [
      {
        text: binding?.preset === preset.id ? `✅ ${preset.name ?? preset.id}` : (preset.name ?? preset.id),
        callback_data: `c:${token}:${index}`,
      },
    ]);

    await this.reply(
      target,
      [
        '<b>Chọn chế độ agent</b>',
        '',
        ...usable.map((preset) => `• <b>${escapeHtml(preset.name ?? preset.id)}</b> — ${escapeHtml(preset.description ?? preset.id)}`),
        '',
        '<i>Chế độ mới áp dụng cho phiên kế tiếp.</i>',
      ].join('\n'),
      keyboard,
    );
  }

  async applyPreset(target, presetId) {
    await this.bindings.patch(target.key, { preset: presetId });
    await this.reply(
      target,
      `✅ Chế độ agent: <code>${escapeHtml(presetId)}</code>\nDùng /new để mở phiên mới với chế độ này.`,
    );
  }

  /* ----------------------------- mode ------------------------------ */

  async cmd_mode(command, target) {
    if (command.rest) {
      const chosen = SANDBOX_MODES.find((mode) => mode.id === command.rest);
      if (!chosen) {
        await this.reply(target, `Chế độ không hợp lệ. Chọn một trong: ${SANDBOX_MODES.map((m) => m.id).join(', ')}`);
        return;
      }
      await this.applyMode(target, chosen.id);
      return;
    }

    const binding = await this.bindings.get(target.key);
    const current = binding?.sandboxMode ?? this.defaultSandboxMode();
    const token = this.stash({ kind: 'mode', choices: SANDBOX_MODES, target });

    const keyboard = SANDBOX_MODES.map((mode, index) => [
      { text: current === mode.id ? `✅ ${mode.label}` : mode.label, callback_data: `c:${token}:${index}` },
    ]);

    await this.reply(
      target,
      [
        '<b>Quyền ghi file</b>',
        '',
        ...SANDBOX_MODES.map((mode) => `• <b>${escapeHtml(mode.label)}</b> — ${escapeHtml(mode.description)}`),
        '',
        current ? `Hiện tại: <code>${escapeHtml(current)}</code>` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      keyboard,
    );
  }

  async applyMode(target, modeId) {
    await this.bindings.patch(target.key, { sandboxMode: modeId });
    const binding = await this.bindings.get(target.key);
    const agent = binding && this.getAgent(binding.sessionId);
    if (agent) {
      try {
        agent.session.append({ type: 'sandbox/mode', data: { mode: modeId } });
      } catch (error) {
        this.logger.warn?.('[dsh-telegram] writing sandbox/mode failed', String(error));
      }
    }
    await this.reply(target, `✅ Quyền ghi file: <code>${escapeHtml(modeId)}</code>`);
  }

  defaultSandboxMode() {
    try {
      return this.ctx.get('sandboxPolicy')?.resolve()?.mode;
    } catch {
      return undefined;
    }
  }

  currentSelection(agent) {
    if (agent) {
      const ref = this.selectionRefs?.get(agent);
      if (ref?.current) return ref.current;
      const header = agent.session.requestHeader?.()?.config;
      if (header) return { provider: header.provider, model: header.model };
    }
    return this.ctx.get('agentDefaultModel')?.currentSelection();
  }

  /* --------------------------- callbacks --------------------------- */

  stash(state) {
    const token = Math.random().toString(36).slice(2, 8);
    this.pending.set(token, state);
    // Choice keyboards are short-lived; drop them after ten minutes.
    setTimeout(() => this.pending.delete(token), 10 * 60_000).unref?.();
    return token;
  }

  /** Handle a `c:` callback produced by a command keyboard. */
  async handleCallback(query) {
    const data = String(query.data ?? '');
    if (!data.startsWith('c:')) return false;

    const [, token, indexText] = data.split(':');
    const state = this.pending.get(token);
    if (!state) {
      await this.api.answerCallback(query.id, { text: 'Lựa chọn đã hết hạn.' });
      return true;
    }

    const choice = state.choices[Number(indexText)];
    if (!choice) {
      await this.api.answerCallback(query.id, { text: 'Lựa chọn không hợp lệ.' });
      return true;
    }

    this.pending.delete(token);
    await this.api.answerCallback(query.id, { text: choice.label ?? choice.id });
    await this.api.editKeyboard(state.target.chatId, query.message?.message_id, [
      [{ text: `✅ ${choice.label ?? choice.id}`, callback_data: 'c:done:noop' }],
    ]);

    if (state.kind === 'model') {
      if (!choice.model) {
        await this.reply(state.target, `Gõ: <code>/model ${escapeHtml(choice.provider)}/tên-model</code>`);
        return true;
      }
      await this.selectModel(state.target, choice.provider, choice.model);
    } else if (state.kind === 'preset') {
      await this.applyPreset(state.target, choice.id);
    } else if (state.kind === 'mode') {
      await this.applyMode(state.target, choice.id);
    }

    return true;
  }
}
