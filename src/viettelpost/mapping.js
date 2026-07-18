const fs = require("fs");

function pathCandidates(paths) {
  if (!paths) return [];
  return Array.isArray(paths) ? paths : [paths];
}

function getByPath(object, dottedPath) {
  if (!dottedPath) return undefined;
  const parts = String(dottedPath)
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);

  let current = object;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

function firstMapped(object, paths, fallbackPaths = []) {
  for (const path of [...pathCandidates(paths), ...fallbackPaths]) {
    const value = getByPath(object, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function loadFieldMapping(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function itemsFromResponse(raw, path) {
  const mapped = path ? getByPath(raw, path) : undefined;
  if (Array.isArray(mapped)) return mapped;
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw && raw.data)) return raw.data;
  if (Array.isArray(raw && raw.orders)) return raw.orders;
  if (Array.isArray(raw && raw.logs)) return raw.logs;
  if (Array.isArray(raw && raw.data && raw.logs)) return raw.data.logs;
  if (Array.isArray(raw && raw.data && raw.data.orders)) return raw.data.orders;
  return [];
}

function listItemsFromResponse(raw, mapping) {
  return itemsFromResponse(raw, mapping && mapping.listOrders && mapping.listOrders.itemsPath);
}

function listCallLogsFromResponse(raw, mapping) {
  return itemsFromResponse(raw, mapping && mapping.callLog && mapping.callLog.itemsPath);
}

module.exports = {
  getByPath,
  firstMapped,
  loadFieldMapping,
  listItemsFromResponse,
  listCallLogsFromResponse
};
