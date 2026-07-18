const { includesAny, normalizeText } = require("../utils/text");
const { dateKey, diffHours, diffWholeDays, parseDateValue } = require("../utils/time");
const { detectDeliveryRegion } = require("../order/regions");

const deliveredKeywords = ["giao thanh cong", "da giao hang", "delivered", "successfully delivered"];
const canceledKeywords = ["huy don", "da huy", "cancelled", "canceled"];
const returnCompletedKeywords = ["hoan hang thanh cong", "hoan thanh hoan", "da hoan", "returned"];
const returningKeywords = ["cho chuyen hoan", "dang chuyen hoan", "chuyen hoan", "hoan ve", "returning"];
const failedDeliveryKeywords = [
  "giao that bai",
  "giao khong thanh cong",
  "khong lien lac duoc",
  "khach khong nghe may",
  "thue bao khong lien lac duoc",
  "khach hen giao lai",
  "khach tu choi nhan",
  "sai so dien thoai",
  "sai dia chi",
  "giao nhieu lan khong thanh cong",
  "failed delivery",
  "delivery failed"
];
const highReturnRiskKeywords = [
  ...failedDeliveryKeywords,
  "cho chuyen hoan",
  "dang chuyen hoan",
  "chuyen hoan",
  "return"
];
const codReconciledKeywords = [
  "da doi soat",
  "doi soat xong",
  "da thanh toan cod",
  "da chuyen cod",
  "paid",
  "reconciled",
  "completed"
];

function statusText(order) {
  return `${order.currentStatusCode || ""} ${order.currentStatusName || ""} ${order.failedDeliveryReason || ""}`;
}

function isDelivered(order) {
  return Boolean(order.deliveredAt) || includesAny(statusText(order), deliveredKeywords);
}

function isCanceled(order) {
  return includesAny(statusText(order), canceledKeywords);
}

function isReturnCompleted(order) {
  return includesAny(statusText(order), returnCompletedKeywords);
}

function isTerminal(order) {
  return isDelivered(order) || isCanceled(order) || isReturnCompleted(order);
}

function isTruthyValue(value) {
  if (value === true || value === 1) return true;
  const text = normalizeText(value);
  return ["1", "true", "yes", "y", "da doi soat", "paid", "reconciled"].includes(text);
}

function isCodReconciled(order) {
  return Boolean(order.codReconciledAt) || isTruthyValue(order.codReconciled) || includesAny(order.codReconciliationStatus, codReconciledKeywords);
}

function isReturningOrHighRisk(order) {
  const eventText = (order.events || []).map((event) => `${event.statusName} ${event.reason}`).join(" ");
  return includesAny(`${statusText(order)} ${eventText}`, highReturnRiskKeywords);
}

function isMissedCall(contact) {
  return normalizeText(contact.type) === "missed_call" || includesAny(contact.type, ["missed call", "cuoc goi nho", "goi nho"]);
}

function isShipperToReceiver(contact) {
  const direction = normalizeText(contact.direction);
  return (
    direction === "shipper_to_receiver" ||
    direction.includes("shipper to receiver") ||
    direction.includes("buu ta goi nguoi nhan")
  );
}

function missedCalls(order) {
  if (isDelivered(order)) return [];
  return (order.contactHistory || [])
    .filter((contact) => isMissedCall(contact) && isShipperToReceiver(contact) && contact.time)
    .sort((a, b) => parseDateValue(a.time).getTime() - parseDateValue(b.time).getTime());
}

function countMissedContactSessions(calls, sessionMinutes) {
  let sessions = 0;
  let previousTime = null;
  const thresholdMs = sessionMinutes * 60 * 1000;

  for (const call of calls) {
    const currentTime = parseDateValue(call.time);
    if (!currentTime) continue;
    if (!previousTime || currentTime.getTime() - previousTime.getTime() >= thresholdMs) {
      sessions += 1;
    }
    previousTime = currentTime;
  }
  return sessions;
}

function countMissedCallDays(calls, timezone) {
  return new Set(calls.map((call) => dateKey(call.time, timezone)).filter(Boolean)).size;
}

function failedDeliveryEvents(order) {
  return (order.events || []).filter((event) => includesAny(`${event.statusName} ${event.reason}`, failedDeliveryKeywords));
}

function countDeliveryAttempts(order) {
  return Math.max(Number(order.deliveryAttempts || 0), failedDeliveryEvents(order).length);
}

function latestFailedDeliveryReason(order) {
  const events = failedDeliveryEvents(order);
  const latest = events[events.length - 1];
  return (latest && (latest.reason || latest.statusName)) || order.failedDeliveryReason || "";
}

function alertLevelForDays(days, levels) {
  const reached = (levels || []).filter((level) => days >= level);
  if (reached.length === 0) return "";
  return `day-${reached[reached.length - 1]}`;
}

function deliveryStartAt(order) {
  return order.acceptedAt || order.createdAt || null;
}

function lateDeliveryThresholdForRegion(region, config) {
  if (region.code === "south") return config.alerts.lateDeliveryDaysSouth;
  if (region.code === "north" || region.code === "central") return config.alerts.lateDeliveryDaysNorthCentral;
  return config.alerts.lateDeliveryDaysUnknown || config.alerts.lateDeliveryDays;
}

function levelRank(level) {
  const match = String(level || "").match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function missedCallRuleMatched(metrics, config) {
  const mode = String(config.alerts.missedCallAlertMode || "COUNT").toUpperCase();
  const byCount = metrics.missedCallCount > config.alerts.missedCallThreshold;
  const bySessions = metrics.missedContactSessions >= config.alerts.missedContactSessionThreshold;
  const byDays = metrics.missedCallDays >= config.alerts.missedCallDifferentDaysThreshold;

  if (mode === "SESSIONS") return bySessions;
  if (mode === "DAYS") return byDays;
  if (mode === "ANY") return byCount || bySessions || byDays;
  return byCount;
}

function getOrderMetrics(order, config, now) {
  const calls = missedCalls(order);
  const deliveryAttempts = countDeliveryAttempts(order);
  const region = detectDeliveryRegion(order);
  const lateDeliveryThresholdDays = lateDeliveryThresholdForRegion(region, config);
  const startAt = deliveryStartAt(order);

  return {
    deliveryDays: diffWholeDays(startAt, now),
    deliveryStartAt: startAt,
    daysSinceDelivered: diffWholeDays(order.deliveredAt, now),
    hoursSinceUpdate: diffHours(order.lastUpdatedAt, now),
    missedCallCount: calls.length,
    missedContactSessions: countMissedContactSessions(calls, config.alerts.missedContactSessionMinutes),
    missedCallDays: countMissedCallDays(calls, config.timezone),
    deliveryAttempts,
    failedDeliveryReason: latestFailedDeliveryReason(order),
    deliveryRegionCode: region.code,
    deliveryRegionName: region.name,
    deliveryProvince: region.province,
    lateDeliveryThresholdDays
  };
}

function baseAlert(order, metrics, alertType, alertLevel, title, reason) {
  return {
    trackingNumber: order.trackingNumber,
    alertType,
    alertLevel,
    title,
    reason,
    statusCode: order.currentStatusCode || "",
    statusName: order.currentStatusName || "",
    deliveryDays: metrics.deliveryDays,
    missedCallCount: metrics.missedCallCount,
    missedContactSessions: metrics.missedContactSessions,
    missedCallDays: metrics.missedCallDays,
    deliveryAttempts: metrics.deliveryAttempts,
    failedDeliveryReason: metrics.failedDeliveryReason || order.failedDeliveryReason || "",
    deliveryStartAt: metrics.deliveryStartAt || null,
    daysSinceDelivered: metrics.daysSinceDelivered,
    deliveryRegionCode: metrics.deliveryRegionCode || "",
    deliveryRegionName: metrics.deliveryRegionName || "",
    deliveryProvince: metrics.deliveryProvince || "",
    lateDeliveryThresholdDays: metrics.lateDeliveryThresholdDays,
    lastUpdatedAt: order.lastUpdatedAt || null,
    order
  };
}

function evaluateOrder(order, config, now = new Date()) {
  const metrics = getOrderMetrics(order, config, now);
  const alerts = [];
  const terminal = isTerminal(order);

  if (!terminal && metrics.deliveryStartAt && metrics.deliveryDays > metrics.lateDeliveryThresholdDays) {
    const level = alertLevelForDays(metrics.deliveryDays, config.alerts.lateDeliveryLevels) || "late";
    alerts.push(
      baseAlert(
        order,
        metrics,
        "LATE_DELIVERY",
        level,
        level === "day-10" ? "Canh bao khan: don giao cham" : level === "day-7" ? "Canh bao nghiem trong: don giao cham" : "Canh bao giao cham",
        `Don thuoc ${metrics.deliveryRegionName}, da ${metrics.deliveryDays} ngay chua giao thanh cong, qua nguong ${metrics.lateDeliveryThresholdDays} ngay.`
      )
    );
  }

  if (!terminal && missedCallRuleMatched(metrics, config)) {
    alerts.push(
      baseAlert(
        order,
        metrics,
        "MISSED_CALLS",
        `calls-${metrics.missedCallCount}-sessions-${metrics.missedContactSessions}`,
        "Canh bao cuoc goi nho",
        `Ship goi khach ${metrics.missedCallCount} cuoc goi nho, vuot nguong ${config.alerts.missedCallThreshold} cuoc.`
      )
    );
  }

  if (!terminal && metrics.deliveryAttempts >= config.alerts.failedDeliveryThreshold) {
    alerts.push(
      baseAlert(
        order,
        metrics,
        "FAILED_DELIVERY",
        `attempts-${metrics.deliveryAttempts}`,
        "Canh bao giao that bai",
        `Don co ${metrics.deliveryAttempts} lan giao that bai.`
      )
    );
  }

  if (!terminal && order.lastUpdatedAt && metrics.hoursSinceUpdate > config.alerts.noUpdateHours) {
    alerts.push(
      baseAlert(
        order,
        metrics,
        "NO_UPDATE",
        `${Math.floor(metrics.hoursSinceUpdate)}h`,
        "Canh bao khong cap nhat trang thai",
        `Don khong doi trang thai trong ${Math.floor(metrics.hoursSinceUpdate)} gio.`
      )
    );
  }

  if (!terminal && isReturningOrHighRisk(order)) {
    alerts.push(
      baseAlert(
        order,
        metrics,
        "RETURNING_RISK",
        "risk",
        "Don co nguy co hoan",
        "Trang thai hoac ly do giao hang cho thay nguy co chuyen hoan cao."
      )
    );
  }

  if (isDelivered(order) && order.deliveredAt && !isCodReconciled(order)) {
    const daysSinceDelivered = metrics.daysSinceDelivered;
    if (daysSinceDelivered > config.alerts.codOverdueDays) {
      alerts.push(
        baseAlert(
          order,
          { ...metrics, daysSinceDelivered },
          "COD_OVERDUE",
          `cod-${daysSinceDelivered}d`,
          "Canh bao COD chua doi soat",
          `Don da giao thanh cong ${daysSinceDelivered} ngay nhung COD chua doi soat.`
        )
      );
    }
  }

  return { metrics, alerts };
}

function shouldSendAlert(alert, lastAlert) {
  if (!lastAlert) return true;
  if (alert.alertType !== lastAlert.alertType) return true;
  if (levelRank(alert.alertLevel) > levelRank(lastAlert.alertLevel)) return true;
  if ((alert.missedCallCount || 0) > (lastAlert.missedCallCount || 0)) return true;
  if ((alert.missedContactSessions || 0) > (lastAlert.missedContactSessions || 0)) return true;
  if ((alert.deliveryAttempts || 0) > (lastAlert.deliveryAttempts || 0)) return true;
  if ((alert.statusCode || "") !== (lastAlert.statusCode || "")) return true;
  if ((alert.statusName || "") !== (lastAlert.statusName || "")) return true;

  const stableNoUpdate =
    alert.alertType === "NO_UPDATE" &&
    (alert.lastUpdatedAt || "") === (lastAlert.lastUpdatedAt || "") &&
    (alert.statusCode || "") === (lastAlert.statusCode || "");
  if (stableNoUpdate) return false;

  return (alert.alertLevel || "") !== (lastAlert.alertLevel || "");
}

module.exports = {
  evaluateOrder,
  getOrderMetrics,
  shouldSendAlert,
  isDelivered,
  isCanceled,
  isReturnCompleted,
  isTerminal,
  isCodReconciled,
  isReturningOrHighRisk,
  missedCalls,
  countMissedContactSessions,
  countDeliveryAttempts,
  failedDeliveryEvents
};
