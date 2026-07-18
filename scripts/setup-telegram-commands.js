const { getConfig } = require("../src/config");
const { sanitizeError } = require("../src/utils/sanitize");

const commands = [
  { command: "bc1", description: "Liệt kê đơn đang giao hàng" },
  { command: "bc2", description: "Liệt kê đơn đang cần xử lý" },
  { command: "bc3", description: "Liệt kê đơn chờ phát lại" },
  { command: "bc4", description: "Liệt kê đơn giao quá 4 ngày" },
  { command: "bc5", description: "Tổng hợp doanh thu lũy tiến" },
  { command: "help", description: "Xem danh sách lệnh báo cáo" }
];

async function telegramRequest(method, payload, config) {
  const { botToken } = config.telegram;
  if (!botToken) throw new Error("Chua cau hinh TELEGRAM_BOT_TOKEN.");

  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    throw new Error(`Telegram ${method} loi: ${body.description || response.statusText}`);
  }
  return body.result;
}

async function setCommands(scope, config) {
  return telegramRequest(
    "setMyCommands",
    {
      commands,
      ...(scope ? { scope } : {})
    },
    config
  );
}

async function main() {
  const config = getConfig();
  const results = [
    {
      scope: "default",
      ok: await setCommands({ type: "default" }, config)
    },
    {
      scope: "all_group_chats",
      ok: await setCommands({ type: "all_group_chats" }, config)
    }
  ];

  if (config.telegram.chatId) {
    results.push({
      scope: "chat",
      chatId: config.telegram.chatId,
      ok: await setCommands({ type: "chat", chat_id: config.telegram.chatId }, config)
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        commandCount: commands.length,
        commands,
        results
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(JSON.stringify(sanitizeError(error), null, 2));
  process.exit(1);
});
