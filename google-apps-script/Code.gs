const DEFAULT_SPREADSHEET_ID = "122J1Dee1mtk74Ay7tuiunQBSgl-XWDHD2BUI3omfNxw";

const SHEETS = {
  CONFIG: "config",
  ORDERS: "orders_snapshot",
  REVENUE: "revenue_ledger",
  STATE: "bot_state",
  LOGS: "logs"
};

const TELEGRAM_COMMANDS = [
  { command: "bc1", description: "Liệt kê đơn đang giao hàng" },
  { command: "bc2", description: "Liệt kê đơn đang cần xử lý" },
  { command: "bc3", description: "Liệt kê đơn chờ phát lại" },
  { command: "bc4", description: "Liệt kê đơn giao quá 4 ngày" },
  { command: "bc5", description: "Tổng hợp doanh thu lũy tiến" },
  { command: "help", description: "Xem danh sách lệnh báo cáo" }
];

function setup() {
  ensureSheets_();
  setupTriggers();
  setupTelegramCommands();
  log_("SETUP", "Đã tạo trigger 07:00/20:00 và đăng ký lệnh Telegram.");
}

function setupTriggers() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === "scheduledReport")
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger("scheduledReport").timeBased().everyDays(1).atHour(7).create();
  ScriptApp.newTrigger("scheduledReport").timeBased().everyDays(1).atHour(20).create();
}

function scheduledReport() {
  sendReport_("bc2", getConfig_().TELEGRAM_CHAT_ID, null);
}

function doPost(e) {
  try {
    const update = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    handleTelegramUpdate_(update);
    return HtmlService.createHtmlOutput("ok");
  } catch (error) {
    log_("ERROR", error.message || String(error), "", 0, "", JSON.stringify({ stack: error.stack || "" }));
    return HtmlService.createHtmlOutput("error");
  }
}

function setTelegramWebhook(webAppUrl) {
  const config = getConfig_();
  const payload = {
    url: webAppUrl,
    allowed_updates: ["message", "edited_message"]
  };
  if (config.TELEGRAM_WEBHOOK_SECRET) {
    payload.secret_token = config.TELEGRAM_WEBHOOK_SECRET;
  }
  return telegramApi_("setWebhook", payload);
}

function setupTelegramCommands() {
  const config = getConfig_();
  const scopes = [{ type: "default" }, { type: "all_group_chats" }];
  if (config.TELEGRAM_CHAT_ID) {
    scopes.push({ type: "chat", chat_id: config.TELEGRAM_CHAT_ID });
  }
  scopes.forEach((scope) => telegramApi_("setMyCommands", { commands: TELEGRAM_COMMANDS, scope }));
  return true;
}

function runBc1() {
  return sendReport_("bc1", getConfig_().TELEGRAM_CHAT_ID, null);
}

function runBc2() {
  return sendReport_("bc2", getConfig_().TELEGRAM_CHAT_ID, null);
}

function runBc3() {
  return sendReport_("bc3", getConfig_().TELEGRAM_CHAT_ID, null);
}

function runBc4() {
  return sendReport_("bc4", getConfig_().TELEGRAM_CHAT_ID, null);
}

function runBc5() {
  return sendReport_("bc5", getConfig_().TELEGRAM_CHAT_ID, null);
}

function handleTelegramUpdate_(update) {
  const message = update && (update.message || update.edited_message);
  if (!message || !message.chat || !message.text) return;

  const config = getConfig_();
  const chatId = String(message.chat.id);
  if (config.TELEGRAM_CHAT_ID && chatId !== String(config.TELEGRAM_CHAT_ID)) {
    log_("IGNORED", "Tin nhắn không thuộc group được phép.", "", 0, "", JSON.stringify({ chatId }));
    return;
  }

  const parsed = parseCommand_(message.text);
  if (!parsed) return;

  if (parsed.command === "help" || parsed.command === "start") {
    sendTelegram_(chatId, buildHelpMessage_(), message.message_id);
    return;
  }

  if (!["bc1", "bc2", "bc3", "bc4", "bc5"].includes(parsed.command)) return;
  sendReport_(parsed.command, chatId, message.message_id);
}

function sendReport_(reportCode, chatId, replyToMessageId) {
  const config = getConfig_();
  const code = String(reportCode || "bc2").toLowerCase();
  const startedAt = new Date();

  if (code === "bc5") {
    const rows = fetchEvaluatedRows_(Number(config.REVENUE_SCAN_DAYS_BACK || 3650));
    const revenue = upsertRevenueLedger_(rows.filter((row) => isDelivered_(row.order) && Number(row.order.codAmount || 0) > 0));
    const summary = getRevenueSummary_();
    const messages = buildRevenueMessages_(revenue, summary, config);
    const telegram = sendMessages_(chatId, messages, replyToMessageId);
    log_("REPORT", "Gửi /bc5", code, summary.orderCount, telegram[0] && telegram[0].message_id, JSON.stringify(summary));
    return { reportCode: code, revenue, summary, telegram, startedAt };
  }

  const rows = fetchEvaluatedRows_(Number(config.ORDER_DAYS_BACK || 60));
  writeOrdersSnapshot_(rows);
  upsertRevenueLedger_(rows.filter((row) => isDelivered_(row.order) && Number(row.order.codAmount || 0) > 0));

  const reportRows = filterRowsForReport_(code, rows, config);
  const messages = buildOrderMessages_(code, reportRows, config);
  const telegram = sendMessages_(chatId, messages, replyToMessageId);
  log_("REPORT", "Gửi /" + code, code, reportRows.length, telegram[0] && telegram[0].message_id, JSON.stringify({ trackingNumbers: reportRows.map((row) => row.order.trackingNumber) }));
  return { reportCode: code, orderCount: reportRows.length, telegram, startedAt };
}

function fetchEvaluatedRows_(daysBack) {
  const config = getConfig_();
  const orders = listOrders_(daysBack).map((order) => hydrateOrder_(order, config));
  return orders.map((order) => {
    const metrics = getMetrics_(order, config);
    return {
      order,
      metrics,
      alerts: evaluateAlerts_(order, metrics, config)
    };
  });
}

function listOrders_(daysBack) {
  const config = getConfig_();
  const body = {
    from_date: formatVietnameseDate_(daysAgo_(Math.max(1, Number(daysBack || 60)))),
    to_date: formatVietnameseDate_(new Date()),
    list_status: [],
    list_inventory: [],
    filter: ""
  };
  const raw = viettelRequest_(config.VIETTELPOST_LIST_ORDERS_PATH, "POST", body, config);
  return listItems_(raw).map(normalizeOrder_);
}

function hydrateOrder_(order, config) {
  let merged = order;
  if (order.trackingNumber && config.VIETTELPOST_ORDER_DETAIL_PATH) {
    try {
      const detailPath = config.VIETTELPOST_ORDER_DETAIL_PATH.replace(":trackingNumber", encodeURIComponent(order.trackingNumber));
      merged = mergeOrder_(order, normalizeOrder_(viettelRequest_(detailPath, "GET", null, config)));
    } catch (error) {
      log_("WARN", "Không lấy được chi tiết đơn " + order.trackingNumber + ": " + error.message);
    }
  }

  if (merged.trackingNumber && config.VIETTELPOST_CALL_LOG_PATH) {
    try {
      const callPath = config.VIETTELPOST_CALL_LOG_PATH.replace(":trackingNumber", encodeURIComponent(merged.trackingNumber));
      const rawLogs = listItems_(viettelRequest_(callPath, "GET", null, config));
      merged.contactHistory = normalizeCalls_(rawLogs);
    } catch (error) {
      merged.contactHistory = merged.contactHistory || [];
    }
  }
  return merged;
}

function viettelRequest_(path, method, body, config) {
  const url = buildUrl_(config.VIETTELPOST_API_BASE_URL, path);
  const options = {
    method: method || "GET",
    contentType: "application/json",
    muteHttpExceptions: true,
    headers: {
      Token: getViettelSessionToken_(config)
    }
  };
  if (body) options.payload = JSON.stringify(body);

  const response = UrlFetchApp.fetch(url, options);
  const text = response.getContentText();
  const json = text ? JSON.parse(text) : {};
  if (response.getResponseCode() >= 400 || json.error === true) {
    throw new Error("Viettel Post lỗi: " + (json.message || response.getResponseCode()));
  }
  return json;
}

function getViettelSessionToken_(config) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("viettel_session_token");
  if (cached) return cached;

  const apiToken = getScriptProp_("VIETTELPOST_TOKEN");
  if (!apiToken) throw new Error("Chưa có Script Property VIETTELPOST_TOKEN.");

  if (!config.VIETTELPOST_TOKEN_LOGIN_PATH) return apiToken;

  const response = UrlFetchApp.fetch(buildUrl_(config.VIETTELPOST_API_BASE_URL, config.VIETTELPOST_TOKEN_LOGIN_PATH), {
    method: "POST",
    contentType: "application/json",
    payload: JSON.stringify({ token: apiToken }),
    muteHttpExceptions: true
  });
  const json = JSON.parse(response.getContentText() || "{}");
  const sessionToken = json.token || (json.data && json.data.token);
  if (!sessionToken) throw new Error("Không lấy được data.token từ /user/loginVTP.");
  cache.put("viettel_session_token", sessionToken, 3300);
  return sessionToken;
}

function normalizeOrder_(raw) {
  const base = raw && raw.data && !raw.ORDER_NUMBER ? raw.data : raw || {};
  const trackingNumber = stringFirst_(base, ["trackingNumber", "orderNumber", "ORDER_NUMBER", "ORDER_CODE"]);
  const currentStatusName = stringFirst_(base, ["currentStatusName", "statusName", "ORDER_STATUS_NAME", "STATUS_NAME"]);
  return {
    trackingNumber,
    orderCode: stringFirst_(base, ["orderCode", "shopOrderCode", "ORDER_CODE"]),
    receiverName: stringFirst_(base, ["receiverName", "customerName", "RECEIVER_FULLNAME", "RECEIVER_NAME"]),
    receiverPhone: stringFirst_(base, ["receiverPhone", "phone", "RECEIVER_PHONE"]),
    receiverProvince: stringFirst_(base, ["receiverProvince", "RECEIVER_PROVINCE", "RECEIVER_PROVINCE_NAME"]),
    receiverAddress: stringFirst_(base, ["receiverAddress", "address", "RECEIVER_ADDRESS", "RECEIVER_FULL_ADDRESS"]),
    codAmount: numberFirst_(base, ["codAmount", "moneyCollection", "MONEY_COLLECTION", "ORDER_PAYMENT", "PRODUCT_PRICE"]),
    createdAt: dateIso_(first_(base, ["createdAt", "createdDate", "ORDER_DATE"])),
    acceptedAt: dateIso_(first_(base, ["acceptedAt", "receivedAt", "PICKUP_DATE"])),
    deliveredAt: dateIso_(first_(base, ["deliveredAt", "DELIVERED_DATE"])),
    codReconciledAt: dateIso_(first_(base, ["codReconciledAt", "MONEY_COLLECTION_DATE", "COD_PAYMENT_DATE"])),
    codReconciled: first_(base, ["codReconciled", "isCodReconciled", "IS_COD_RECONCILED"]),
    codReconciliationStatus: stringFirst_(base, ["codReconciliationStatus", "COD_PAYMENT_STATUS"]),
    currentStatusCode: stringFirst_(base, ["currentStatusCode", "statusCode", "ORDER_STATUS"]),
    currentStatusName,
    failedDeliveryReason: stringFirst_(base, ["failedDeliveryReason", "reason", "NOTE", "ORDER_NOTE"]),
    lastUpdatedAt: dateIso_(first_(base, ["lastUpdatedAt", "updatedAt", "UPDATED_DATE"])),
    deliveryAttempts: numberFirst_(base, ["deliveryAttempts", "DELIVERY_ATTEMPTS"]),
    contactHistory: normalizeCalls_(first_(base, ["contactHistory", "calls", "callHistory"]) || []),
    rawJson: JSON.stringify(raw)
  };
}

function normalizeCalls_(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    type: stringFirst_(item, ["type", "callType", "contactType"]),
    direction: stringFirst_(item, ["direction", "callDirection"]),
    time: dateIso_(first_(item, ["time", "createdAt", "callTime"])),
    rawJson: JSON.stringify(item)
  }));
}

function getMetrics_(order, config) {
  const deliveryStartAt = order.acceptedAt || order.createdAt || "";
  const deliveryDays = diffWholeDays_(deliveryStartAt, new Date());
  const missedCallCount = (order.contactHistory || []).filter(isMissedCall_).length;
  return {
    deliveryStartAt,
    deliveryDays,
    missedCallCount,
    deliveryAttempts: Number(order.deliveryAttempts || 0),
    deliveryRegionName: detectRegionName_(order),
    daysSinceDelivered: diffWholeDays_(order.deliveredAt, new Date())
  };
}

function evaluateAlerts_(order, metrics, config) {
  const alerts = [];
  if (!isTerminal_(order) && metrics.deliveryDays > lateThreshold_(metrics.deliveryRegionName, config)) {
    alerts.push("Quá hạn giao theo vùng");
  }
  if (!isTerminal_(order) && metrics.missedCallCount > 2) {
    alerts.push("Ship gọi nhỡ quá ngưỡng");
  }
  if (isDelivered_(order) && order.deliveredAt && !isCodReconciled_(order) && metrics.daysSinceDelivered > 3) {
    alerts.push("COD chưa đối soát");
  }
  if (!isTerminal_(order) && includesAny_(statusBlob_(order), ["cho xu ly", "chờ xử lý"])) {
    alerts.push("Đơn chờ xử lý");
  }
  return alerts;
}

function filterRowsForReport_(code, rows, config) {
  if (code === "bc1") return rows.filter((row) => isInDelivery_(row.order));
  if (code === "bc2") return rows.filter((row) => row.alerts.length > 0);
  if (code === "bc3") return rows.filter((row) => isWaitingRedelivery_(row.order));
  if (code === "bc4") return rows.filter((row) => !isTerminal_(row.order) && row.metrics.deliveryDays > Number(config.BC4_OVER_DAYS || 4));
  return [];
}

function buildOrderMessages_(code, rows, config) {
  const titles = {
    bc1: "/BC1 - ĐƠN ĐANG GIAO HÀNG",
    bc2: "/BC2 - ĐƠN ĐANG CẦN XỬ LÝ",
    bc3: "/BC3 - ĐƠN CHỜ PHÁT LẠI",
    bc4: "/BC4 - ĐƠN GIAO QUÁ 4 NGÀY"
  };
  const empty = {
    bc1: "Hiện không có đơn đang giao hàng.",
    bc2: "Hiện không có đơn quá hạn giao, COD quá hạn đối soát hoặc ship gọi nhỡ quá ngưỡng.",
    bc3: "Hiện không có đơn chờ phát lại.",
    bc4: "Hiện không có đơn chưa giao nào quá 4 ngày."
  };
  let message = `<b>${escapeHtml_(titles[code] || titles.bc2)}</b>\n<b>Thời gian:</b> ${formatDateTime_(new Date())}\n<b>Tổng số đơn:</b> ${rows.length}\n`;
  if (rows.length === 0) return [message + "\n" + empty[code]];

  rows.slice(0, Number(config.REPORT_MAX_ROWS || 80)).forEach((row, index) => {
    const order = row.order;
    message += [
      "",
      `<b>${index + 1}. Mã vận đơn:</b> <code>${escapeHtml_(order.trackingNumber || "-")}</code>`,
      `<b>Mã đơn shop:</b> <code>${escapeHtml_(order.orderCode || "-")}</code>`,
      `<b>Khách hàng:</b> ${escapeHtml_(short_(order.receiverName))}`,
      `<b>Số điện thoại:</b> <code>${escapeHtml_(maskPhone_(order.receiverPhone, config.MASK_PHONE === "true"))}</code>`,
      `<b>COD:</b> ${formatMoney_(order.codAmount)}`,
      `<b>Trạng thái:</b> ${escapeHtml_(short_(order.currentStatusName || order.currentStatusCode))}`,
      `<b>Số ngày:</b> ${row.metrics.deliveryDays} | <b>Gọi nhỡ:</b> ${row.metrics.missedCallCount}`,
      row.alerts.length ? `<b>Lý do:</b> ${escapeHtml_(row.alerts.join(", "))}` : ""
    ].filter(Boolean).join("\n") + "\n";
  });
  return splitTelegram_(message);
}

function buildRevenueMessages_(result, summary, config) {
  const message = [
    "<b>/BC5 - DOANH THU LŨY TIẾN</b>",
    `<b>Thời gian:</b> ${formatDateTime_(new Date())}`,
    "",
    `<b>Tổng doanh thu đã lưu:</b> ${formatMoney_(summary.totalRevenue)}`,
    `<b>Số đơn đã ghi:</b> ${summary.orderCount}`,
    `<b>Đơn mới ghi thêm lần này:</b> ${result.insertedCount}`,
    `<b>Đơn cập nhật lại lần này:</b> ${result.updatedCount}`,
    `<b>Quét dữ liệu:</b> ${config.REVENUE_SCAN_DAYS_BACK} ngày gần nhất`,
    "",
    "Sổ này cộng lũy tiến theo mã vận đơn đã giao có COD, nên dữ liệu cũ vẫn giữ lại nếu app Viettel Post xóa bớt lịch sử."
  ].join("\n");
  return [message];
}

function upsertRevenueLedger_(rows) {
  const sheet = getSheet_(SHEETS.REVENUE);
  const data = sheet.getDataRange().getValues();
  const indexByCode = {};
  for (let i = 1; i < data.length; i += 1) {
    if (data[i][0]) indexByCode[String(data[i][0])] = i + 1;
  }

  let insertedCount = 0;
  let updatedCount = 0;
  rows.forEach((row) => {
    const order = row.order || row;
    const values = [
      order.trackingNumber,
      order.orderCode,
      order.receiverName,
      order.receiverPhone,
      Number(order.codAmount || 0),
      order.deliveredAt,
      order.createdAt,
      order.acceptedAt,
      order.currentStatusName,
      new Date(),
      new Date()
    ];
    const existingRow = indexByCode[String(order.trackingNumber || "")];
    if (existingRow) {
      sheet.getRange(existingRow, 1, 1, values.length).setValues([values]);
      updatedCount += 1;
    } else if (order.trackingNumber) {
      sheet.appendRow(values);
      insertedCount += 1;
    }
  });
  return { insertedCount, updatedCount };
}

function getRevenueSummary_() {
  const data = getSheet_(SHEETS.REVENUE).getDataRange().getValues().slice(1).filter((row) => row[0]);
  return {
    orderCount: data.length,
    totalRevenue: data.reduce((total, row) => total + Number(row[4] || 0), 0)
  };
}

function writeOrdersSnapshot_(rows) {
  const sheet = getSheet_(SHEETS.ORDERS);
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }
  if (rows.length === 0) return;
  const values = rows.map((row) => {
    const order = row.order;
    return [
      order.trackingNumber,
      order.orderCode,
      order.receiverName,
      order.receiverPhone,
      order.receiverProvince,
      order.receiverAddress,
      order.codAmount,
      order.createdAt,
      order.acceptedAt,
      order.deliveredAt,
      order.currentStatusCode,
      order.currentStatusName,
      order.failedDeliveryReason,
      row.metrics.deliveryDays,
      row.metrics.missedCallCount,
      row.metrics.deliveryAttempts,
      row.metrics.deliveryRegionName,
      order.lastUpdatedAt,
      new Date(),
      order.rawJson
    ];
  });
  sheet.getRange(2, 1, values.length, values[0].length).setValues(values);
}

function getConfig_() {
  const props = PropertiesService.getScriptProperties();
  const config = {
    TELEGRAM_BOT_TOKEN: props.getProperty("TELEGRAM_BOT_TOKEN") || "",
    VIETTELPOST_TOKEN: props.getProperty("VIETTELPOST_TOKEN") || "",
    TELEGRAM_WEBHOOK_SECRET: props.getProperty("TELEGRAM_WEBHOOK_SECRET") || ""
  };
  const data = getSheet_(SHEETS.CONFIG).getDataRange().getValues();
  data.slice(1).forEach((row) => {
    if (row[0]) config[String(row[0])] = row[1];
  });
  return config;
}

function getScriptProp_(name) {
  return PropertiesService.getScriptProperties().getProperty(name) || "";
}

function telegramApi_(method, payload) {
  const token = getScriptProp_("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("Chưa có Script Property TELEGRAM_BOT_TOKEN.");
  const response = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/" + method, {
    method: "POST",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const json = JSON.parse(response.getContentText() || "{}");
  if (json.ok === false) throw new Error("Telegram lỗi: " + json.description);
  return json.result;
}

function sendMessages_(chatId, messages, replyToMessageId) {
  return messages.map((message) => sendTelegram_(chatId, message, replyToMessageId));
}

function sendTelegram_(chatId, html, replyToMessageId) {
  const payload = {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true
  };
  if (replyToMessageId) payload.reply_to_message_id = replyToMessageId;
  return telegramApi_("sendMessage", payload);
}

function buildHelpMessage_() {
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

function parseCommand_(text) {
  const line = String(text || "").split(/\r?\n/).map((item) => item.trim()).filter((item) => item.indexOf("/") === 0)[0] || "";
  const match = line.match(/^\/([a-z0-9_]+)(?:@[a-zA-Z0-9_]+)?/i);
  return match ? { command: match[1].toLowerCase() } : null;
}

function ensureSheets_() {
  Object.keys(SHEETS).forEach((key) => getSheet_(SHEETS[key]));
}

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(getScriptProp_("SPREADSHEET_ID") || DEFAULT_SPREADSHEET_ID);
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function log_(type, message, reportCode, orderCount, telegramMessageId, rawJson) {
  getSheet_(SHEETS.LOGS).appendRow([new Date(), type, message, reportCode || "", orderCount || "", telegramMessageId || "", rawJson || ""]);
}

function buildUrl_(baseUrl, path) {
  return String(baseUrl || "").replace(/\/+$/, "") + "/" + String(path || "").replace(/^\/+/, "");
}

function listItems_(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw && raw.data)) return raw.data;
  if (Array.isArray(raw && raw.orders)) return raw.orders;
  if (Array.isArray(raw && raw.logs)) return raw.logs;
  if (Array.isArray(raw && raw.data && raw.data.orders)) return raw.data.orders;
  return [];
}

function mergeOrder_(base, detail) {
  const output = {};
  Object.keys(base || {}).forEach((key) => (output[key] = base[key]));
  Object.keys(detail || {}).forEach((key) => {
    if (detail[key] !== "" && detail[key] !== null && detail[key] !== undefined) output[key] = detail[key];
  });
  return output;
}

function isDelivered_(order) {
  return Boolean(order.deliveredAt) || includesAny_(statusBlob_(order), ["giao thanh cong", "đã giao", "delivered"]);
}

function isTerminal_(order) {
  return isDelivered_(order) || includesAny_(statusBlob_(order), ["da huy", "hủy", "hoan hang thanh cong", "đã hoàn"]);
}

function isCodReconciled_(order) {
  return Boolean(order.codReconciledAt) || includesAny_(String(order.codReconciled) + " " + order.codReconciliationStatus, ["true", "da doi soat", "đã đối soát", "paid"]);
}

function isInDelivery_(order) {
  return !isTerminal_(order) && includesAny_(statusBlob_(order), ["dang giao hang", "đang giao hàng", "dang van chuyen", "đang vận chuyển", "da lay hang", "đã lấy hàng"]);
}

function isWaitingRedelivery_(order) {
  return !isTerminal_(order) && includesAny_(statusBlob_(order), ["cho phat lai", "chờ phát lại", "hen giao lai", "hẹn giao lại", "giao lai"]);
}

function isMissedCall_(call) {
  return includesAny_(String(call.type) + " " + call.direction, ["missed_call", "missed call", "cuoc goi nho", "gọi nhỡ"]);
}

function statusBlob_(order) {
  return [order.currentStatusCode, order.currentStatusName, order.failedDeliveryReason].join(" ");
}

function detectRegionName_(order) {
  const text = normalizeText_([order.receiverProvince, order.receiverAddress].join(" "));
  const south = ["ho chi minh", "tp hcm", "dong nai", "binh duong", "long an", "can tho", "kien giang", "an giang", "ca mau"];
  const central = ["thanh hoa", "nghe an", "ha tinh", "hue", "da nang", "quang nam", "quang ngai", "binh dinh", "khanh hoa", "lam dong", "dak lak"];
  if (south.some((item) => text.indexOf(item) >= 0)) return "Miền Nam";
  if (central.some((item) => text.indexOf(item) >= 0)) return "Miền Trung";
  return "Miền Bắc";
}

function lateThreshold_(regionName, config) {
  return regionName === "Miền Nam" ? 4 : 3;
}

function first_(object, paths) {
  for (let i = 0; i < paths.length; i += 1) {
    const value = object && object[paths[i]];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function stringFirst_(object, paths) {
  return String(first_(object, paths) || "").trim();
}

function numberFirst_(object, paths) {
  const value = first_(object, paths);
  if (typeof value === "number") return value;
  const number = Number(String(value || "0").replace(/[^\d.-]+/g, ""));
  return isFinite(number) ? number : 0;
}

function dateIso_(value) {
  const date = parseDate_(value);
  return date ? date.toISOString() : "";
}

function parseDate_(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const text = String(value).trim();
  const vn = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (vn) return new Date(`${vn[3]}-${pad2_(vn[2])}-${pad2_(vn[1])}T${pad2_(vn[4] || 0)}:${pad2_(vn[5] || 0)}:${pad2_(vn[6] || 0)}+07:00`);
  const date = new Date(text);
  return isNaN(date.getTime()) ? null : date;
}

function diffWholeDays_(from, to) {
  const fromDate = parseDate_(from);
  const toDate = parseDate_(to) || new Date();
  if (!fromDate) return 0;
  return Math.max(0, Math.floor((toDate.getTime() - fromDate.getTime()) / 86400000));
}

function daysAgo_(days) {
  return new Date(new Date().getTime() - days * 86400000);
}

function formatVietnameseDate_(date) {
  return `${pad2_(date.getDate())}/${pad2_(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function formatDateTime_(date) {
  return Utilities.formatDate(parseDate_(date) || new Date(), "Asia/Ho_Chi_Minh", "HH:mm:ss dd/MM/yyyy");
}

function formatMoney_(value) {
  return Utilities.formatString("%s đ", Number(value || 0).toLocaleString("vi-VN"));
}

function maskPhone_(phone, enabled) {
  const text = String(phone || "");
  if (!enabled || text.length < 7) return text;
  return text.slice(0, 3) + "****" + text.slice(-3);
}

function normalizeText_(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

function includesAny_(value, keywords) {
  const text = normalizeText_(value);
  return keywords.some((keyword) => text.indexOf(normalizeText_(keyword)) >= 0);
}

function escapeHtml_(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function short_(value) {
  const text = String(value || "-").trim();
  return text.length > 42 ? text.slice(0, 39) + "..." : text;
}

function splitTelegram_(message) {
  const limit = 3900;
  if (message.length <= limit) return [message];
  const chunks = [];
  let current = "";
  message.split("\n\n").forEach((part) => {
    if ((current + "\n\n" + part).length > limit) {
      chunks.push(current);
      current = part;
    } else {
      current = current ? current + "\n\n" + part : part;
    }
  });
  if (current) chunks.push(current);
  return chunks;
}

function pad2_(value) {
  return String(value).padStart(2, "0");
}
