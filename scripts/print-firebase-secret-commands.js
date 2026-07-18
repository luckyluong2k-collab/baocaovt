const secrets = [
  "TELEGRAM_BOT_TOKEN",
  "VIETTELPOST_TOKEN",
  "VIETTELPOST_PASSWORD",
  "ADMIN_API_KEY",
  "VIETTELPOST_WEBHOOK_SECRET"
];

console.log("Chay cac lenh sau va dan gia tri khi Firebase CLI hoi. Khong ghi secret vao file:");
for (const name of secrets) {
  console.log(`firebase functions:secrets:set ${name}`);
}
