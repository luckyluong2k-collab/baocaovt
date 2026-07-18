const { normalizeText } = require("../utils/text");

const northProvinces = [
  "Bắc Giang",
  "Bắc Kạn",
  "Bắc Ninh",
  "Cao Bằng",
  "Điện Biên",
  "Hà Giang",
  "Hà Nam",
  "Hà Nội",
  "Hải Dương",
  "Hải Phòng",
  "Hòa Bình",
  "Hưng Yên",
  "Lai Châu",
  "Lạng Sơn",
  "Lào Cai",
  "Nam Định",
  "Ninh Bình",
  "Phú Thọ",
  "Quảng Ninh",
  "Sơn La",
  "Thái Bình",
  "Thái Nguyên",
  "Tuyên Quang",
  "Vĩnh Phúc",
  "Yên Bái"
];

const centralProvinces = [
  "Bình Định",
  "Bình Thuận",
  "Đà Nẵng",
  "Đắk Lắk",
  "Đắk Nông",
  "Gia Lai",
  "Hà Tĩnh",
  "Huế",
  "Khánh Hòa",
  "Kon Tum",
  "Lâm Đồng",
  "Nghệ An",
  "Ninh Thuận",
  "Phú Yên",
  "Quảng Bình",
  "Quảng Nam",
  "Quảng Ngãi",
  "Quảng Trị",
  "Thanh Hóa",
  "Thừa Thiên Huế"
];

const southProvinces = [
  "An Giang",
  "Bà Rịa Vũng Tàu",
  "Bạc Liêu",
  "Bến Tre",
  "Bình Dương",
  "Bình Phước",
  "Cà Mau",
  "Cần Thơ",
  "Đồng Nai",
  "Đồng Tháp",
  "Hậu Giang",
  "Hồ Chí Minh",
  "Kiên Giang",
  "Long An",
  "Sóc Trăng",
  "Tây Ninh",
  "Tiền Giang",
  "TP Hồ Chí Minh",
  "TP.HCM",
  "Trà Vinh",
  "Vĩnh Long"
];

const regionDefinitions = [
  { code: "north", name: "Miền Bắc", provinces: northProvinces },
  { code: "central", name: "Miền Trung", provinces: centralProvinces },
  { code: "south", name: "Miền Nam", provinces: southProvinces }
].map((region) => ({
  ...region,
  normalizedProvinces: region.provinces.map((province) => normalizeForRegion(province))
}));

function normalizeForRegion(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function receiverRegionText(order) {
  return [
    order.receiverProvince,
    order.receiverDistrict,
    order.receiverWard,
    order.receiverAddress
  ]
    .filter(Boolean)
    .join(" ");
}

function detectDeliveryRegion(order) {
  const text = normalizeForRegion(receiverRegionText(order));

  for (const region of regionDefinitions) {
    const province = region.normalizedProvinces.find((item) => item && text.includes(item));
    if (province) {
      return {
        code: region.code,
        name: region.name,
        province: region.provinces[region.normalizedProvinces.indexOf(province)]
      };
    }
  }

  return {
    code: "unknown",
    name: "Chưa xác định vùng",
    province: String(order.receiverProvince || "").trim()
  };
}

module.exports = {
  detectDeliveryRegion,
  northProvinces,
  centralProvinces,
  southProvinces
};
