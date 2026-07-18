const { sanitize } = require("../utils/sanitize");

async function sendTelegramMessage(htmlMessage, config) {
  const { botToken, chatId, dryRun } = config.telegram;
  if (dryRun || !botToken || !chatId) {
    return {
      ok: true,
      dryRun: true,
      chatId: chatId ? "[CONFIGURED]" : "[MISSING]",
      preview: htmlMessage.slice(0, 500)
    };
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: htmlMessage,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    const message = body.description || `Telegram HTTP ${response.status}`;
    throw new Error(`Khong gui duoc Telegram: ${message}`);
  }

  return sanitize({
    ok: true,
    dryRun: false,
    messageId: body.result && body.result.message_id,
    chatId: body.result && body.result.chat && body.result.chat.id
  });
}

async function sendSystemError(error, config) {
  const message = [
    "<b>🚨 BOT VIETTEL POST BỊ LỖI</b>",
    "",
    "Hệ thống không hoàn tất được lần kiểm tra vận đơn.",
    "",
    `<b>Lỗi:</b> ${String(error && error.message ? error.message : error).replace(/</g, "&lt;").replace(/>/g, "&gt;")}`
  ].join("\n");
  return sendTelegramMessage(message, config);
}

module.exports = {
  sendTelegramMessage,
  sendSystemError
};
