/**
 * Channel copy in Vietnamese and English.
 *
 * DSH's own locale registry only ships `zh` and `en` — `LOCALE_IDS = ['zh',
 * 'en']`, and its schema is a union over exactly those two, so a `vi`
 * preference is rejected outright. Following the host locale would therefore
 * have meant hiding Vietnamese behind the Chinese option, which is a trick
 * rather than a translation.
 *
 * So this channel carries its own `language` setting. It governs both faces at
 * once — the messages the bot sends and the labels on the settings card —
 * because a bot answering in Vietnamese from a card labelled in English is one
 * product speaking two languages at the user.
 *
 * Every string lives here rather than at its use site so a missing translation
 * is visible as a missing key instead of surfacing as untranslated text in
 * production.
 */

/** Supported language tags, in menu order. */
export const LANGUAGES = ['vi', 'en'];

/** Used when a stored value is absent or not one this build knows. */
export const DEFAULT_LANGUAGE = 'vi';

const DICTIONARY = {
  vi: {
    /* ---- bot messages ---- */
    denied: '⛔️ Bạn không có quyền dùng bot này.',
    deniedClaimed: (id) =>
      `⛔️ Bot này đã có chủ. Nhờ chủ bot thêm id của bạn: <code>${id}</code>`,
    claimFailed: (id) =>
      `⚠️ Không lưu được quyền sở hữu. Hãy thêm id của bạn trong Settings: <code>${id}</code>`,
    claimed: (id) =>
      [
        '✅ <b>Bạn là chủ bot này.</b>',
        '',
        `Từ giờ chỉ id <code>${id}</code> dùng được bot. ` +
          'Muốn cho thêm người thì vào Settings → Plugins → Telegram.',
        '',
        'Gõ /help để xem các lệnh.',
      ].join('\n'),
    welcome: 'Chào bạn! Gửi tin nhắn để trò chuyện với agent, hoặc gõ /help để xem các lệnh.',
    stopped: 'kênh Telegram đã dừng',

    /* ---- settings card ---- */
    cardTitle: 'Telegram',
    cardDescription:
      'Kênh Telegram: gửi ảnh, bảng thật, câu hỏi có nút bấm, đổi model trong chat.',
    unsaved: 'chưa lưu',
    tokenLabel: 'Bot token',
    tokenConfigured: 'đã cấu hình',
    tokenMissing: 'chưa có',
    tokenUnknown: 'không rõ',
    tokenPlaceholderSet: 'Đã lưu — nhập để thay',
    tokenPlaceholderEmpty: 'Dán token từ @BotFather',
    tokenHint: (ref) =>
      `Token nằm trong kho credential ${ref}, không nằm trong file cấu hình. ` +
      'Để trống nghĩa là giữ token đang có.',
    languageLabel: 'Ngôn ngữ',
    languageHint: 'Áp dụng cho tin nhắn bot và thẻ cấu hình này.',
    enabledLabel: 'Bật kênh Telegram',
    routeQuestionsLabel: 'Hỏi ngay trong Telegram',
    routeQuestionsHint:
      'Câu hỏi phát sinh từ phiên Telegram sẽ hiện nút bấm trong chat. Tắt thì chúng hiện ở Web.',
    routeApprovalsLabel: 'Duyệt quyền ngay trong Telegram',
    routeApprovalsHint:
      'Yêu cầu cấp quyền từ phiên Telegram sẽ hiện nút Cho phép / Từ chối trong chat. ' +
      'Tắt thì chúng chỉ hiện ở Web — và nếu bạn không mở trình duyệt, thao tác sẽ bị từ chối.',
    allowedLabel: 'User được phép dùng bot',
    allowedHint:
      'Telegram user id, cách nhau bởi dấu phẩy. Để trống nghĩa là bot chưa có chủ — ' +
      'người gõ /start đầu tiên sẽ thành chủ.',
    workspaceLabel: 'Thư mục làm việc',
    workspaceHint: 'Nơi agent chạy lệnh và đọc ghi file.',
    restartNotice:
      'Token, thư mục làm việc và công tắc bật/tắt chỉ có hiệu lực sau khi khởi động lại DSH.',
    reset: 'Đặt lại',
    save: 'Lưu',
    saving: 'Đang lưu…',
    saved: 'Đã lưu',
    discard: 'Huỷ',
    saveFailed: 'Lưu không thành công — kiểm tra lại giá trị',
  },

  en: {
    /* ---- bot messages ---- */
    denied: '⛔️ You are not allowed to use this bot.',
    deniedClaimed: (id) =>
      `⛔️ This bot already has an owner. Ask them to add your id: <code>${id}</code>`,
    claimFailed: (id) =>
      `⚠️ Could not record ownership. Please add your id in Settings: <code>${id}</code>`,
    claimed: (id) =>
      [
        '✅ <b>You now own this bot.</b>',
        '',
        `Only id <code>${id}</code> can use it from now on. ` +
          'To let others in, go to Settings → Plugins → Telegram.',
        '',
        'Send /help to see the commands.',
      ].join('\n'),
    welcome: 'Hello! Send a message to talk to the agent, or /help to list the commands.',
    stopped: 'the Telegram channel stopped',

    /* ---- settings card ---- */
    cardTitle: 'Telegram',
    cardDescription:
      'Telegram channel: images, real tables, questions with buttons, model switching in chat.',
    unsaved: 'unsaved',
    tokenLabel: 'Bot token',
    tokenConfigured: 'configured',
    tokenMissing: 'not set',
    tokenUnknown: 'unknown',
    tokenPlaceholderSet: 'Stored — type to replace',
    tokenPlaceholderEmpty: 'Paste the token from @BotFather',
    tokenHint: (ref) =>
      `The token lives in credential ${ref}, never in a config file. ` +
      'Leave this blank to keep the stored one.',
    languageLabel: 'Language',
    languageHint: 'Applies to both bot messages and this card.',
    enabledLabel: 'Enable the Telegram channel',
    routeQuestionsLabel: 'Ask inside Telegram',
    routeQuestionsHint:
      'Questions raised by a Telegram session get buttons in the chat. Turn this off to answer them in the Web UI.',
    routeApprovalsLabel: 'Approve inside Telegram',
    routeApprovalsHint:
      'Permission requests from a Telegram session get Allow / Deny buttons in the chat. ' +
      'Turn this off and they only appear in the Web UI — with no browser open, the action is refused.',
    allowedLabel: 'Users allowed to use the bot',
    allowedHint:
      'Telegram user ids, comma separated. Empty means the bot is unclaimed — ' +
      'the first person to send /start becomes its owner.',
    workspaceLabel: 'Working directory',
    workspaceHint: 'Where the agent runs commands and reads or writes files.',
    restartNotice:
      'The token, working directory and on/off switch only take effect after DSH restarts.',
    reset: 'Reset',
    save: 'Save',
    saving: 'Saving…',
    saved: 'Saved',
    discard: 'Discard',
    saveFailed: 'Save failed — check the values',
  },
};

/** Human-readable names for the language picker, in their own language. */
export const LANGUAGE_NAMES = { vi: 'Tiếng Việt', en: 'English' };

/**
 * Build a translator for one language.
 *
 * An unknown key returns the key itself rather than empty text: a visible
 * `tokenLabel` in the UI names the missing entry, while a blank label would
 * look like a rendering bug and hide which string was never written.
 *
 * @param {string} [language] one of {@link LANGUAGES}
 * @returns {(key: string, ...args: unknown[]) => string}
 */
export function translator(language) {
  const table = DICTIONARY[language] ?? DICTIONARY[DEFAULT_LANGUAGE];
  return (key, ...args) => {
    const entry = table[key] ?? DICTIONARY[DEFAULT_LANGUAGE][key];
    if (entry === undefined) return key;
    return typeof entry === 'function' ? entry(...args) : entry;
  };
}
