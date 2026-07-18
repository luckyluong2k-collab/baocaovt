const { includesAny, normalizeText } = require("../utils/text");
const { dateKey, diffHours, diffWholeDays, parseDateValue } = require("../utils/time");

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

function levelRank(level) {
  const match = String(level || "").match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function missedCallRuleMatched(metrics, config) {
  const mode = String(config.alerts.missedCallAlertMode || "COUNT").toUpperCase();
  const byCount = metrics.missedCallCount >= config.alerts.missedCallThreshold;
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

  return {
    deliveryDays: diffWholeDays(order.acceptedAt, now),
    hoursSinceUpdate: diffHours(order.lastUpdatedAt, now),
    missedCallCount: calls.length,
    missedContactSessions: countMissedContactSessions(calls, config.alerts.missedContactSessionMinutes),
    missedCallDays: countMissedCallDays(calls, config.timezone),
    deliveryAttempts,
    failedDeliveryReason: latestFailedDeliveryReason(order)
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
    lastUpdatedAt: order.lastUpdatedAt || null,
    order
  };
}

function evaluateOrder(order, config, now = new Date()) {
  const metrics = getOrderMetrics(order, config, now);
  const alerts = [];
  const terminal = isTerminal(order);

  if (!terminal && order.acceptedAt && metrics.deliveryDays >= config.alerts.lateDeliveryDays) {
    const level = alertLevelForDays(metrics.deliveryDays, config.alerts.lateDeliveryLevels) || "late";
    alerts.push(
      baseAlert(
        order,
        metrics,
        "LATE_DELIVERY",
        level,
        level === "day-10" ? "Canh bao khan: don giao cham" : level === "day-7" ? "Canh bao nghiem trong: don giao cham" : "Canh bao giao cham",
        `Don da duoc Viettel Post nhan ${metrics.deliveryDays} ngay nhung chua giao thanh cong.`
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
        `Co ${metrics.missedCallCount} cuoc goi nho, gom ${metrics.missedContactSessions} phien lien he that bai.`
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

  if (isDelivered(order) && order.deliveredAt && !order.codReconciledAt) {
    const daysSinceDelivered = diffWholeDays(order.deliveredAt, now);
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
  isReturningOrHighRisk,
  missedCalls,
  countMissedContactSessions,
  countDeliveryAttempts,
  failedDeliveryEvents
};
