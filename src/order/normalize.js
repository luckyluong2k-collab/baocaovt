const { firstMapped } = require("../viettelpost/mapping");
const { isoOrNull } = require("../utils/time");
const { toNumber } = require("../utils/csv");

const orderFallbackPaths = {
  trackingNumber: ["trackingNumber", "tracking_number", "orderNumber", "order_number", "ORDER_NUMBER", "data.trackingNumber"],
  orderCode: ["orderCode", "order_code", "shopOrderCode", "ORDER_CODE", "data.orderCode"],
  receiverName: ["receiverName", "receiver_name", "customerName", "RECEIVER_FULLNAME", "data.receiverName"],
  receiverPhone: ["receiverPhone", "receiver_phone", "phone", "RECEIVER_PHONE", "data.receiverPhone"],
  receiverProvince: [
    "receiverProvince",
    "receiver_province",
    "receiverProvinceName",
    "RECEIVER_PROVINCE",
    "RECEIVER_PROVINCE_NAME",
    "data.receiverProvince"
  ],
  receiverDistrict: [
    "receiverDistrict",
    "receiver_district",
    "receiverDistrictName",
    "RECEIVER_DISTRICT",
    "RECEIVER_DISTRICT_NAME",
    "data.receiverDistrict"
  ],
  receiverWard: ["receiverWard", "receiver_ward", "receiverWardName", "RECEIVER_WARD", "RECEIVER_WARD_NAME", "data.receiverWard"],
  receiverAddress: [
    "receiverAddress",
    "receiver_address",
    "address",
    "RECEIVER_ADDRESS",
    "RECEIVER_FULL_ADDRESS",
    "data.receiverAddress"
  ],
  senderPhone: ["senderPhone", "sender_phone", "SENDER_PHONE", "data.senderPhone"],
  codAmount: ["codAmount", "cod_amount", "moneyCollection", "MONEY_COLLECTION", "data.codAmount"],
  createdAt: ["createdAt", "created_at", "createdDate", "ORDER_DATE", "data.createdAt"],
  acceptedAt: ["acceptedAt", "accepted_at", "receivedAt", "PICKUP_DATE", "data.acceptedAt"],
  lastUpdatedAt: ["lastUpdatedAt", "last_updated_at", "updatedAt", "UPDATED_DATE", "data.lastUpdatedAt"],
  currentStatusCode: ["currentStatusCode", "statusCode", "status_code", "ORDER_STATUS", "data.currentStatusCode"],
  currentStatusName: ["currentStatusName", "statusName", "status_name", "ORDER_STATUS_NAME", "data.currentStatusName"],
  deliveryAttempts: ["deliveryAttempts", "delivery_attempts", "data.deliveryAttempts"],
  failedDeliveryReason: ["failedDeliveryReason", "reason", "failed_reason", "data.failedDeliveryReason"],
  contactHistory: ["contactHistory", "contact_history", "calls", "data.contactHistory"],
  events: ["events", "histories", "statusHistory", "data.events"],
  deliveredAt: ["deliveredAt", "delivered_at", "data.deliveredAt"],
  codReconciledAt: [
    "codReconciledAt",
    "cod_reconciled_at",
    "codPaidAt",
    "cod_paid_at",
    "reconciledAt",
    "MONEY_COLLECTION_DATE",
    "COD_PAYMENT_DATE",
    "data.codReconciledAt"
  ],
  codReconciled: ["codReconciled", "cod_reconciled", "isCodReconciled", "IS_COD_RECONCILED", "data.codReconciled"],
  codReconciliationStatus: [
    "codReconciliationStatus",
    "cod_reconciliation_status",
    "codPaymentStatus",
    "COD_PAYMENT_STATUS",
    "data.codReconciliationStatus"
  ],
  postOfficeName: ["postOfficeName", "post_office_name", "data.postOfficeName"],
  shipperName: ["shipperName", "shipper_name", "data.shipperName"],
  shipperPhone: ["shipperPhone", "shipper_phone", "data.shipperPhone"]
};

const contactFallbackPaths = {
  type: ["type", "callType", "contactType"],
  direction: ["direction", "callDirection"],
  time: ["time", "createdAt", "callTime"],
  durationSeconds: ["durationSeconds", "duration", "callDuration"],
  shipperName: ["shipperName", "shipper_name"],
  shipperPhone: ["shipperPhone", "shipper_phone"]
};

const eventFallbackPaths = {
  time: ["time", "createdAt", "updatedAt"],
  statusCode: ["statusCode", "status_code", "code"],
  statusName: ["statusName", "status_name", "name"],
  reason: ["reason", "note", "description"],
  postOfficeName: ["postOfficeName", "post_office_name"],
  shipperName: ["shipperName", "shipper_name"],
  shipperPhone: ["shipperPhone", "shipper_phone"]
};

function mapped(raw, mapping, group, field) {
  return firstMapped(raw, mapping && mapping[group] && mapping[group][field], orderFallbackPaths[field] || []);
}

function normalizeContactHistory(rawContacts, mapping) {
  if (!Array.isArray(rawContacts)) return [];
  return rawContacts.map((item) => ({
    type: String(firstMapped(item, mapping && mapping.contactHistory && mapping.contactHistory.type, contactFallbackPaths.type) || "UNKNOWN"),
    direction: String(
      firstMapped(item, mapping && mapping.contactHistory && mapping.contactHistory.direction, contactFallbackPaths.direction) || "UNKNOWN"
    ),
    time: isoOrNull(firstMapped(item, mapping && mapping.contactHistory && mapping.contactHistory.time, contactFallbackPaths.time)),
    durationSeconds: toNumber(
      firstMapped(item, mapping && mapping.contactHistory && mapping.contactHistory.durationSeconds, contactFallbackPaths.durationSeconds)
    ),
    shipperName: String(
      firstMapped(item, mapping && mapping.contactHistory && mapping.contactHistory.shipperName, contactFallbackPaths.shipperName) || ""
    ),
    shipperPhone: String(
      firstMapped(item, mapping && mapping.contactHistory && mapping.contactHistory.shipperPhone, contactFallbackPaths.shipperPhone) || ""
    ),
    rawData: item
  }));
}

function normalizeEvents(rawEvents, mapping) {
  if (!Array.isArray(rawEvents)) return [];
  return rawEvents.map((item) => ({
    time: isoOrNull(firstMapped(item, mapping && mapping.event && mapping.event.time, eventFallbackPaths.time)),
    statusCode: String(firstMapped(item, mapping && mapping.event && mapping.event.statusCode, eventFallbackPaths.statusCode) || ""),
    statusName: String(firstMapped(item, mapping && mapping.event && mapping.event.statusName, eventFallbackPaths.statusName) || ""),
    reason: String(firstMapped(item, mapping && mapping.event && mapping.event.reason, eventFallbackPaths.reason) || ""),
    postOfficeName: String(firstMapped(item, mapping && mapping.event && mapping.event.postOfficeName, eventFallbackPaths.postOfficeName) || ""),
    shipperName: String(firstMapped(item, mapping && mapping.event && mapping.event.shipperName, eventFallbackPaths.shipperName) || ""),
    shipperPhone: String(firstMapped(item, mapping && mapping.event && mapping.event.shipperPhone, eventFallbackPaths.shipperPhone) || ""),
    rawData: item
  }));
}

function fallbackAcceptedAt(rawAcceptedAt, events) {
  if (rawAcceptedAt) return isoOrNull(rawAcceptedAt);
  const acceptedEvent = events.find((event) => {
    const text = `${event.statusName} ${event.reason}`.toLowerCase();
    return text.includes("nhan hang") || text.includes("nhận hàng") || text.includes("accepted") || text.includes("picked");
  });
  return acceptedEvent ? acceptedEvent.time : null;
}

function latestEventTime(events, fallback) {
  const times = events.map((event) => event.time).filter(Boolean).sort();
  return isoOrNull(fallback) || times[times.length - 1] || null;
}

function normalizeOrder(raw, mapping = {}) {
  const rawEvents = mapped(raw, mapping, "order", "events");
  const events = normalizeEvents(rawEvents, mapping);
  const rawContactHistory = mapped(raw, mapping, "order", "contactHistory");
  const contactHistory = normalizeContactHistory(rawContactHistory, mapping);

  const currentStatusName = String(mapped(raw, mapping, "order", "currentStatusName") || "");
  const currentStatusCode = String(mapped(raw, mapping, "order", "currentStatusCode") || "");

  return {
    trackingNumber: String(mapped(raw, mapping, "order", "trackingNumber") || "").trim(),
    orderCode: String(mapped(raw, mapping, "order", "orderCode") || "").trim(),
    receiverName: String(mapped(raw, mapping, "order", "receiverName") || "").trim(),
    receiverPhone: String(mapped(raw, mapping, "order", "receiverPhone") || "").trim(),
    receiverProvince: String(mapped(raw, mapping, "order", "receiverProvince") || "").trim(),
    receiverDistrict: String(mapped(raw, mapping, "order", "receiverDistrict") || "").trim(),
    receiverWard: String(mapped(raw, mapping, "order", "receiverWard") || "").trim(),
    receiverAddress: String(mapped(raw, mapping, "order", "receiverAddress") || "").trim(),
    senderPhone: String(mapped(raw, mapping, "order", "senderPhone") || "").trim(),
    codAmount: toNumber(mapped(raw, mapping, "order", "codAmount")),
    createdAt: isoOrNull(mapped(raw, mapping, "order", "createdAt")),
    acceptedAt: fallbackAcceptedAt(mapped(raw, mapping, "order", "acceptedAt"), events),
    lastUpdatedAt: latestEventTime(events, mapped(raw, mapping, "order", "lastUpdatedAt")),
    currentStatusCode,
    currentStatusName,
    deliveryAttempts: toNumber(mapped(raw, mapping, "order", "deliveryAttempts")),
    failedDeliveryReason: String(mapped(raw, mapping, "order", "failedDeliveryReason") || "").trim(),
    contactHistory,
    events,
    deliveredAt: isoOrNull(mapped(raw, mapping, "order", "deliveredAt")),
    codReconciledAt: isoOrNull(mapped(raw, mapping, "order", "codReconciledAt")),
    codReconciled: mapped(raw, mapping, "order", "codReconciled"),
    codReconciliationStatus: String(mapped(raw, mapping, "order", "codReconciliationStatus") || "").trim(),
    postOfficeName: String(mapped(raw, mapping, "order", "postOfficeName") || "").trim(),
    shipperName: String(mapped(raw, mapping, "order", "shipperName") || "").trim(),
    shipperPhone: String(mapped(raw, mapping, "order", "shipperPhone") || "").trim(),
    rawData: raw
  };
}

function mergeOrder(base, detail) {
  return {
    ...base,
    ...Object.fromEntries(Object.entries(detail || {}).filter(([, value]) => value !== "" && value !== null && value !== undefined)),
    rawData: {
      base: base && base.rawData,
      detail: detail && detail.rawData
    }
  };
}

module.exports = {
  normalizeOrder,
  normalizeContactHistory,
  normalizeEvents,
  mergeOrder
};
