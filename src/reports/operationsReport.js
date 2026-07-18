const { evaluateOrder, isDelivered, isTerminal } = require("../alerts/rules");
const { escapeHtml, formatMoney, htmlCode, maskPhone } = require("../alerts/telegramMessage");
const { getStore } = require("../store");
const { sendTelegramMessage } = require("../telegram/client");
const { includesAny } = require("../utils/text");
const { formatDateTime, nowDate } = require("../utils/time");
const { ViettelPostClient } = require("../viettelpost/client");

const TELEGRAM_LIMIT = 3900;
const DEFAULT_LIMIT = 80;

const reportDefinitions = {
  bc1: {
    title: "/BC1 - ĐƠN ĐANG GIAO HÀNG",
    emptyText: "Hiện không có đơn đang giao hàng trong nguồn dữ liệu đang cấu hình."
  },
  bc2: {
    title: "/BC2 - ĐƠN ĐANG CẦN XỬ LÝ",
    emptyText: "Hiện không có đơn quá hạn giao, COD quá hạn đối soát hoặc ship gọi nhỡ quá ngưỡng."
  },
  bc3: {
    title: "/BC3 - ĐƠN CHỜ PHÁT LẠI",
    emptyText: "Hiện không có đơn chờ phát lại trong nguồn dữ liệu đang cấu hình."
  },
  bc4: {
    title: "/BC4 - ĐƠN GIAO QUÁ 4 NGÀY",
    emptyText: "Hiện không có đơn chưa giao nào quá 4 ngày."
  },
  bc5: {
    title: "/BC5 - DOANH THU LŨY TIẾN"
  }
};

const inDeliveryKeywords = [
  "dang giao hang",
  "dang di giao",
  "dang van chuyen",
  "dang trung chuyen",
  "da nhan hang",
  "nhap kho",
  "xuat kho",
  "in transit",
  "delivering",
  "out for delivery"
];

const redeliveryKeywords = [
  "cho phat lai",
  "hen phat lai",
  "cho giao lai",
  "hen giao lai",
  "phat lai",
  "giao lai",
  "khach hen",
  "reschedule",
  "redelivery"
];

function shortText(value, maxLength = 42) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function statusBlob(order) {
  const events = (order.events || []).map((event) => `${event.statusName || ""} ${event.reason || ""}`).join(" ");
  return `${order.currentStatusCode || ""} ${order.currentStatusName || ""} ${order.failedDeliveryReason || ""} ${events}`;
}

function isInDelivery(order) {
  if (isTerminal(order)) return false;
  return includesAny(statusBlob(order), inDeliveryKeywords);
}

function isWaitingRedelivery(order) {
  if (isTerminal(order)) return false;
  return includesAny(statusBlob(order), redeliveryKeywords);
}

function reportAlertTypes(config) {
  return new Set((config.alerts.reportAlertTypes || []).map((type) => String(type).toUpperCase()));
}

function selectedOperationalAlerts(row, config) {
  const selected = reportAlertTypes(config);
  return row.alerts.filter((alert) => selected.has(String(alert.alertType).toUpperCase()));
}

function sortRows(left, right) {
  const leftDays = Number(left.metrics.deliveryDays || 0);
  const rightDays = Number(right.metrics.deliveryDays || 0);
  if (rightDays !== leftDays) return rightDays - leftDays;
  return String(left.order.lastUpdatedAt || "").localeCompare(String(right.order.lastUpdatedAt || ""));
}

function reportRowsForCode(reportCode, rows, config) {
  const code = String(reportCode || "bc2").toLowerCase();
  const bc4OverDays = (config.reports && config.reports.bc4OverDays) || 4;
  if (code === "bc1") return rows.filter((row) => isInDelivery(row.order)).sort(sortRows);
  if (code === "bc2") return rows.filter((row) => selectedOperationalAlerts(row, config).length > 0).sort(sortRows);
  if (code === "bc3") return rows.filter((row) => isWaitingRedelivery(row.order)).sort(sortRows);
  if (code === "bc4") return rows.filter((row) => !isTerminal(row.order) && row.metrics.deliveryDays > bc4OverDays).sort(sortRows);
  return [];
}

function alertReasonText(alert) {
  const labels = {
    LATE_DELIVERY: "Quá hạn giao theo vùng",
    COD_OVERDUE: "COD chưa đối soát",
    MISSED_CALLS: "Ship gọi nhỡ quá ngưỡng",
    FAILED_DELIVERY: "Giao thất bại",
    NO_UPDATE: "Không cập nhật trạng thái",
    RETURNING_RISK: "Nguy cơ hoàn"
  };
  return `${labels[alert.alertType] || alert.alertType}: ${alert.reason}`;
}

function rowReasons(reportCode, row, config) {
  if (reportCode === "bc2") {
    return selectedOperationalAlerts(row, config).map(alertReasonText);
  }
  if (reportCode === "bc3") return ["Đơn đang ở trạng thái chờ phát lại/giao lại."];
  if (reportCode === "bc4") return [`Đơn đã ${row.metrics.deliveryDays} ngày chưa giao thành công.`];
  return [];
}

function buildHeader(definition, count, config, createdAt) {
  return [
    `<b>${escapeHtml(definition.title)}</b>`,
    `<b>Thời gian:</b> ${escapeHtml(formatDateTime(createdAt, config.timezone))}`,
    `<b>Tổng số đơn:</b> ${escapeHtml(count)}`,
    ""
  ].join("\n");
}

function buildOrderLine(row, index, reportCode, config) {
  const order = row.order;
  const phone = maskPhone(order.receiverPhone, config.alerts.maskPhone);
  const province = row.metrics.deliveryProvince || order.receiverProvince || "-";
  const codDays = order.deliveredAt ? row.metrics.daysSinceDelivered : 0;
  const reasons = rowReasons(reportCode, row, config)
    .map((text) => `- ${escapeHtml(shortText(text, 96))}`)
    .join("\n");

  return [
    `<b>${index + 1}. Mã vận đơn:</b> ${htmlCode(order.trackingNumber)}`,
    `<b>Mã đơn shop:</b> ${htmlCode(order.orderCode)}`,
    `<b>Khách hàng:</b> ${escapeHtml(shortText(order.receiverName || "-"))}`,
    `<b>Số điện thoại:</b> ${htmlCode(phone || "-")}`,
    `<b>Vùng nhận:</b> ${escapeHtml(row.metrics.deliveryRegionName || "-")} - ${escapeHtml(province)}`,
    `<b>COD:</b> ${escapeHtml(formatMoney(order.codAmount))}`,
    `<b>Trạng thái:</b> ${escapeHtml(shortText(order.currentStatusName || order.currentStatusCode || "-"))}`,
    `<b>Ngày tính hạn:</b> ${escapeHtml(formatDateTime(row.metrics.deliveryStartAt, config.timezone) || "-")}`,
    `<b>Số ngày:</b> ${escapeHtml(row.metrics.deliveryDays)} | <b>Gọi nhỡ:</b> ${escapeHtml(row.metrics.missedCallCount)} | <b>COD chưa ĐS:</b> ${escapeHtml(codDays)}`,
    `<b>Cập nhật cuối:</b> ${escapeHtml(formatDateTime(order.lastUpdatedAt, config.timezone) || "-")}`,
    reasons ? `<b>Lý do:</b>\n${reasons}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function splitMessages(header, rows, reportCode, config) {
  if (rows.length === 0) {
    const definition = reportDefinitions[reportCode] || reportDefinitions.bc2;
    return [[header, definition.emptyText].join("\n")];
  }

  const messages = [];
  let current = header;
  const maxRows = (config.reports && config.reports.maxRowsPerReport) || DEFAULT_LIMIT;
  rows.slice(0, maxRows).forEach((row, index) => {
    const line = buildOrderLine(row, index, reportCode, config);
    const next = `${current}${current.endsWith("\n\n") ? "" : "\n\n"}${line}`;
    if (next.length > TELEGRAM_LIMIT && current !== header) {
      messages.push(current);
      current = `${header}${line}`;
    } else {
      current = next;
    }
  });

  if (rows.length > maxRows) {
    const hidden = rows.length - maxRows;
    const suffix = `\n\n<b>Còn lại:</b> ${escapeHtml(hidden)} đơn chưa hiển thị để tránh vượt giới hạn Telegram.`;
    if (`${current}${suffix}`.length <= TELEGRAM_LIMIT) {
      current += suffix;
    }
  }

  messages.push(current);
  return messages;
}

function buildOrderReportMessages(reportCode, rows, config, createdAt = new Date()) {
  const code = String(reportCode || "bc2").toLowerCase();
  const definition = reportDefinitions[code] || reportDefinitions.bc2;
  const header = buildHeader(definition, rows.length, config, createdAt);
  return splitMessages(header, rows, code, config);
}

function revenueEligibleOrders(rows) {
  return rows.map((row) => row.order).filter((order) => order.trackingNumber && isDelivered(order) && Number(order.codAmount || 0) > 0);
}

async function getEvaluatedRows(config) {
  const client = new ViettelPostClient(config);
  const now = nowDate(config);
  const baseOrders = await client.listOrders();
  const rows = [];

  for (const baseOrder of baseOrders) {
    const order = await client.hydrateOrder(baseOrder);
    const { metrics, alerts } = evaluateOrder(order, config, now);
    rows.push({ order, metrics, alerts });
  }

  return rows;
}

function revenueScanConfig(config) {
  return {
    ...config,
    viettelPost: {
      ...config.viettelPost,
      listOrdersDaysBack: (config.revenue && config.revenue.scanDaysBack) || 3650
    }
  };
}

async function recordRevenueFromRows(config, rows) {
  const store = getStore(config);
  await store.load();
  const result = await store.upsertRevenueOrders(revenueEligibleOrders(rows));
  const summary = await store.getRevenueSummary();
  await store.save();
  return { ...result, summary };
}

async function refreshRevenueLedger(config) {
  const rows = await getEvaluatedRows(revenueScanConfig(config));
  return recordRevenueFromRows(config, rows);
}

function buildRevenueReportMessages(revenueResult, config, createdAt = new Date()) {
  const summary = revenueResult.summary || {};
  const lines = [
    `<b>${escapeHtml(reportDefinitions.bc5.title)}</b>`,
    `<b>Thời gian:</b> ${escapeHtml(formatDateTime(createdAt, config.timezone))}`,
    "",
    `<b>Tổng doanh thu đã lưu:</b> ${escapeHtml(formatMoney(summary.totalRevenue || 0))}`,
    `<b>Số đơn đã ghi:</b> ${escapeHtml(summary.orderCount || 0)}`,
    `<b>Đơn mới ghi thêm lần này:</b> ${escapeHtml(revenueResult.insertedCount || 0)}`,
    `<b>Đơn cập nhật lại lần này:</b> ${escapeHtml(revenueResult.updatedCount || 0)}`,
    `<b>Quét dữ liệu:</b> ${escapeHtml((config.revenue && config.revenue.scanDaysBack) || 3650)} ngày gần nhất`,
    summary.firstOrderAt ? `<b>Đơn đầu tiên đã lưu:</b> ${escapeHtml(formatDateTime(summary.firstOrderAt, config.timezone))}` : "",
    summary.lastOrderAt ? `<b>Đơn mới nhất đã lưu:</b> ${escapeHtml(formatDateTime(summary.lastOrderAt, config.timezone))}` : "",
    "",
    "Sổ này cộng lũy tiến theo mã vận đơn bot đã đọc được, nên dữ liệu cũ vẫn giữ lại dù app Viettel Post xóa bớt lịch sử."
  ].filter(Boolean);
  return [lines.join("\n")];
}

async function sendReport(reportCode, config, telegramOptions = {}) {
  const code = String(reportCode || "bc2").toLowerCase();
  const createdAt = new Date();
  let messages;
  let rows = [];
  let revenueResult = null;

  if (code === "bc5") {
    revenueResult = await refreshRevenueLedger(config);
    messages = buildRevenueReportMessages(revenueResult, config, createdAt);
  } else {
    const allRows = await getEvaluatedRows(config);
    revenueResult = await recordRevenueFromRows(config, allRows);
    rows = reportRowsForCode(code, allRows, config);
    messages = buildOrderReportMessages(code, rows, config, createdAt);
  }

  const telegram = [];
  for (const message of messages) {
    telegram.push(await sendTelegramMessage(message, config, telegramOptions));
  }

  const store = getStore(config);
  await store.load();
  await store.recordBotLog({
    type: "OPERATIONS_REPORT",
    reportCode: code,
    sentAt: createdAt.toISOString(),
    orderCount: rows.length,
    messageCount: messages.length,
    revenue: revenueResult,
    telegram
  });
  await store.save();

  return {
    reportCode: code,
    orderCount: rows.length,
    messageCount: messages.length,
    trackingNumbers: rows.map((row) => row.order.trackingNumber),
    revenue: revenueResult && revenueResult.summary,
    telegram
  };
}

async function getUndeliveredRows(config) {
  const allRows = await getEvaluatedRows(config);
  return reportRowsForCode("bc2", allRows, config);
}

function buildUndeliveredReportMessages(rows, config, createdAt = new Date()) {
  return buildOrderReportMessages("bc2", rows, config, createdAt);
}

async function sendUndeliveredReport(config) {
  const summary = await sendReport("bc2", config);
  return {
    undeliveredCount: summary.orderCount,
    messageCount: summary.messageCount,
    trackingNumbers: summary.trackingNumbers,
    telegram: summary.telegram
  };
}

module.exports = {
  buildOrderReportMessages,
  buildRevenueReportMessages,
  buildUndeliveredReportMessages,
  getEvaluatedRows,
  getUndeliveredRows,
  isInDelivery,
  isWaitingRedelivery,
  recordRevenueFromRows,
  refreshRevenueLedger,
  reportRowsForCode,
  sendReport,
  sendUndeliveredReport
};
