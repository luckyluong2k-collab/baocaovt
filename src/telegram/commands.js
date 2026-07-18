const { sendReport } = require("../reports/operationsReport");
const { sendTelegramMessage } = require("./client");

const reportCommands = new Set(["bc1", "bc2", "bc3", "bc4", "bc5"]);

function commandHelpMessage() {
  return [
    "<b>LỆNH BÁO CÁO VIETTEL POST</b>",
    "",
    "<code>/bc1</code> - Liệt kê đơn đang giao hàng",
    "<code>/bc2</code> - Liệt kê đơn đang cần xử lý",
    "<code>/bc3</code> - Liệt kê đơn chờ phát lại",
    "<code>/bc4</code> - Liệt kê đơn giao quá 4 ngày",
    "<code>/bc5</code> - Tổng hợp doanh thu lũy tiến"
  ].join("\n");
}

function parseCommand(text) {
  const match = String(text || "").trim().match(/^\/([a-zA-Z0-9_]+)(?:@[a-zA-Z0-9_]+)?(?:\s+(.*))?$/);
  if (!match) return null;
  return {
    command: match[1].toLowerCase(),
    args: (match[2] || "").trim()
  };
}

function chatAllowed(chatId, config) {
  if (!config.telegram.chatId) return true;
  return String(chatId) === String(config.telegram.chatId);
}

async function handleTelegramUpdate(update, config) {
  const message = update && (update.message || update.edited_message);
  const text = message && message.text;
  const chatId = message && message.chat && message.chat.id;
  const replyToMessageId = message && message.message_id;
  const parsed = parseCommand(text);

  if (!message || !chatId || !parsed) {
    return { ok: true, ignored: true, reason: "not_a_command" };
  }

  if (!chatAllowed(chatId, config)) {
    return { ok: true, ignored: true, reason: "chat_not_allowed", chatId };
  }

  if (parsed.command === "start" || parsed.command === "help" || parsed.command === "trogiup") {
    const telegram = await sendTelegramMessage(commandHelpMessage(), config, { chatId, replyToMessageId });
    return { ok: true, command: parsed.command, telegram };
  }

  if (!reportCommands.has(parsed.command)) {
    return { ok: true, ignored: true, reason: "unknown_command", command: parsed.command };
  }

  const summary = await sendReport(parsed.command, config, { chatId, replyToMessageId });
  return { ok: true, command: parsed.command, summary };
}

module.exports = {
  commandHelpMessage,
  handleTelegramUpdate,
  parseCommand
};
