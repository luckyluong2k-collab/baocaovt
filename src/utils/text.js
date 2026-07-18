function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(value, keywords) {
  const normalized = normalizeText(value);
  return keywords.some((keyword) => normalized.includes(normalizeText(keyword)));
}

function compactString(value) {
  return String(value || "").trim();
}

function stableKey(...parts) {
  return parts
    .map((part) => normalizeText(part).replace(/[^a-z0-9]+/g, "-"))
    .filter(Boolean)
    .join("-");
}

module.exports = {
  normalizeText,
  includesAny,
  compactString,
  stableKey
};
