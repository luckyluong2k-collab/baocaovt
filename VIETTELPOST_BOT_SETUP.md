# Huong dan cai dat bot Viettel Post canh bao Telegram

## 1. Cai dat

Can Node.js 18 tro len.

```powershell
cd "C:\Users\ADMIN\Documents\New project\viettelpost-telegram-bot"
npm install
npm test
```

Du an chay duoc ngay bang mock data, khong can API that.

```powershell
npm run check
```

## 2. Cau hinh bien moi truong

Sao chep `.env.example` thanh `.env` tren may chay bot, sau do dien gia tri that. Khong commit `.env`.

Gia tri quan trong:

```env
USE_MOCK_DATA=false
VIETTELPOST_API_BASE_URL=https://partner.viettelpost.vn/v2
VIETTELPOST_TOKEN=
VIETTELPOST_TOKEN_LOGIN_PATH=/user/loginVTP
VIETTELPOST_LIST_ORDERS_PATH=/order/order-filter?page=1
VIETTELPOST_LIST_ORDERS_METHOD=POST
VIETTELPOST_ORDER_DETAIL_PATH=/core/orders/query?code=:trackingNumber
VIETTELPOST_ORDER_DETAIL_METHOD=GET
VIETTELPOST_CALL_LOG_PATH=/order/call-log?orderNumber=:trackingNumber
VIETTELPOST_CALL_LOG_METHOD=GET
VIETTELPOST_AUTH_HEADER=Token
VIETTELPOST_AUTH_SCHEME=raw
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_WEBHOOK_SECRET=
ADMIN_API_KEY=
TELEGRAM_DRY_RUN=false
```

Neu Viettel Post dung dang nhap username/password de lay token:

```env
VIETTELPOST_USERNAME=
VIETTELPOST_PASSWORD=
VIETTELPOST_LOGIN_PATH=
```

Neu Viettel Post cap ma API tich hop, dien vao `VIETTELPOST_TOKEN` va dat `VIETTELPOST_TOKEN_LOGIN_PATH=/user/loginVTP`. Bot se tu lay token phien tu `data.token`.

## 3. Cach lay Telegram Chat ID

1. Tao bot bang BotFather va lay bot token.
2. Them bot vao nhom Telegram can nhan canh bao.
3. Gui mot tin nhan bat ky trong nhom.
4. Goi API `getUpdates` cua Telegram tren may quan tri de xem `chat.id`.
5. Dien `TELEGRAM_CHAT_ID` vao `.env`.

Neu token that da bi dan vao chat hoac tai lieu chia se, nen tao token moi trong BotFather.

## 4. Chay che do mock

Mac dinh `.env.example` de `USE_MOCK_DATA=true` va `TELEGRAM_DRY_RUN=true`, bot khong goi API that va khong gui Telegram that.

```powershell
npm run check
```

Ket qua mock can co:

- Don qua 5 ngay.
- Don co 3 cuoc goi nho lien tiep nhung chi tinh 1 phien lien he.
- Don giao that bai tu 2 lan.
- Don dang co nguy co chuyen hoan.
- Don khong cap nhat qua 48 gio.
- Don da giao thanh cong khong bi canh bao giao cham.

## 5. Kiem tra Telegram

Bat gui that:

```env
TELEGRAM_DRY_RUN=false
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
ADMIN_API_KEY=...
```

Chay server:

```powershell
npm start
```

Goi test:

```powershell
Invoke-RestMethod -Method Post `
  -Headers @{ "x-admin-key" = "<ADMIN_API_KEY>" } `
  -Uri "http://localhost:8787/api/viettelpost/test-telegram"
```

## 6. Chay thu cong

```powershell
npm run check
```

Hoac qua API noi bo:

```powershell
Invoke-RestMethod -Method Post `
  -Headers @{ "x-admin-key" = "<ADMIN_API_KEY>" } `
  -Uri "http://localhost:8787/api/viettelpost/check-now"
```

Gui bao cao van hanh vao Telegram:

```powershell
npm run report:undelivered
```

Gui tung loai bao cao:

```powershell
npm run report:bc1
npm run report:bc2
npm run report:bc3
npm run report:bc4
npm run report:bc5
```

Hoac qua API noi bo:

```powershell
Invoke-RestMethod -Method Post `
  -Headers @{ "x-admin-key" = "<ADMIN_API_KEY>" } `
  -Uri "http://localhost:8787/api/viettelpost/report-undelivered"
```

Endpoint health:

```text
GET http://localhost:8787/api/viettelpost/health
```

## 7. Chay dinh ky

Dung cron noi bo:

```env
RUN_CRON=true
CHECK_INTERVAL_MINUTES=60
RUN_ON_STARTUP=true
```

Sau do:

```powershell
npm start
```

Khi trien khai Cloud Run, co the de `RUN_CRON=false` va dung Cloud Scheduler goi:

```text
POST /api/viettelpost/check-now
```

Kem header:

```text
x-admin-key: <ADMIN_API_KEY>
```

## 8. Cau hinh webhook

Neu Viettel Post ho tro webhook:

```env
VIETTELPOST_WEBHOOK_SECRET=
```

Endpoint nhan webhook:

```text
POST /api/viettelpost/webhook
```

Header xac thuc:

```text
x-viettelpost-secret: <VIETTELPOST_WEBHOOK_SECRET>
```

Bot se luu event vao `viettelpost_order_events`, chuan hoa don neu JSON co du field, sau do danh gia canh bao ngay.

## 9. Noi API Viettel Post that

Hien chua co tai lieu API Viettel Post that trong project, nen adapter khong tu bia endpoint hoac status code.

Can dien:

```env
USE_MOCK_DATA=false
VIETTELPOST_API_BASE_URL=https://partner.viettelpost.vn/v2
VIETTELPOST_TOKEN_LOGIN_PATH=/user/loginVTP
VIETTELPOST_LIST_ORDERS_PATH=/order/order-filter?page=1
VIETTELPOST_LIST_ORDERS_METHOD=POST
VIETTELPOST_ORDER_DETAIL_PATH=/core/orders/query?code=:trackingNumber
VIETTELPOST_ORDER_DETAIL_METHOD=GET
VIETTELPOST_CALL_LOG_PATH=/order/call-log?orderNumber=:trackingNumber
VIETTELPOST_CALL_LOG_METHOD=GET
VIETTELPOST_AUTH_HEADER=Token
VIETTELPOST_AUTH_SCHEME=raw
VIETTELPOST_FIELD_MAPPING_FILE=viettelpost-field-mapping.example.json
```

Sau khi co JSON that, sua `viettelpost-field-mapping.example.json` hoac tao file mapping rieng. Mapping chi la duong dan field trong JSON, khong chua token.

## 10. Kiem tra API co lich su cuoc goi hay khong

Sau khi dien endpoint that:

```powershell
$env:USE_MOCK_DATA="false"
npm run capture:sample -- <MA_VAN_DON>
```

Script se ghi `data/viettelpost-sample.sanitized.json` da an token/password/header nhay cam.

Mo file sample va tim cac field co y nghia nhu:

- `contactHistory`
- `calls`
- `callHistory`
- `contactLogs`

Neu API khong tra lich su cuoc goi, bot van hoat dong bang trang thai, lich su trang thai va ly do giao that bai.

## 11. Luat bao cao van hanh

Mac dinh bot bao cao cac nhom sau:

- Mien Bac/Mien Trung: don chua giao thanh cong qua 3 ngay.
- Mien Nam: don chua giao thanh cong qua 4 ngay.
- COD: don da giao thanh cong qua 3 ngay nhung chua doi soat COD.
- Cuoc goi: ship goi khach qua 2 cuoc goi nho.

Co the doi bang bien moi truong:

```env
LATE_DELIVERY_DAYS_NORTH_CENTRAL=3
LATE_DELIVERY_DAYS_SOUTH=4
LATE_DELIVERY_DAYS_UNKNOWN=3
MISSED_CALL_THRESHOLD=2
COD_OVERDUE_DAYS=3
REPORT_ALERT_TYPES=LATE_DELIVERY,COD_OVERDUE,MISSED_CALLS
REPORT_MAX_ROWS=80
BC4_OVER_DAYS=4
REVENUE_SCAN_DAYS_BACK=3650
```

## 12. Lenh Telegram

Khi co server/Firebase/Cloud Run online va Telegram webhook duoc tro vao bot, co the goi trong group:

```text
/bc1  Liet ke cac don dang giao hang
/bc2  Liet ke cac don dang can xu ly
/bc3  Liet ke cac don cho phat lai
/bc4  Liet ke cac don giao qua 4 ngay
/bc5  Tong hop doanh thu luy tien
```

Endpoint nhan lenh Telegram:

```text
POST /api/telegram/webhook
```

Neu dat `TELEGRAM_WEBHOOK_SECRET`, khi goi Telegram `setWebhook` can dung cung secret token de Telegram gui header `x-telegram-bot-api-secret-token`.

GitHub Actions mien phi co the doc lenh theo lich bang workflow `Telegram - Doc lenh bao cao`, moi 5 phut mot lan. Neu can tra loi gan nhu tuc thi thi dung server/webhook online.

`/bc5` luu doanh thu theo ma van don da giao co COD vao `viettelpost_revenue_ledger`. Neu app Viettel Post xoa bot lich su cu sau vai thang, cac ma da tung duoc bot ghi van con trong so luy tien nay.

## 13. Doc log va xu ly loi

Du lieu bot luu tai:

```text
storage/viettelpost-db.json
```

Cac nhom du lieu:

- `viettelpost_orders`
- `viettelpost_order_events`
- `viettelpost_alerts`
- `viettelpost_bot_logs`
- `viettelpost_revenue_ledger`

Log duoc an token, password, authorization header va secret.

## 14. Bao mat

- Khong commit `.env`.
- Khong dan token vao source code.
- Dat `ADMIN_API_KEY` manh cho cac API thao tac.
- Bat `PROTECT_READ_ENDPOINTS=true` neu endpoint dat tren internet.
- Bat rate limit mac dinh cho `check-now` va `test-telegram`.
- Khong luu token Viettel Post hoac Telegram vao database.

## 15. Cac endpoint noi bo

```text
GET  /api/viettelpost/health
GET  /api/viettelpost/orders
GET  /api/viettelpost/orders/:trackingNumber
GET  /api/viettelpost/alerts
POST /api/viettelpost/check-now
POST /api/viettelpost/test-telegram
POST /api/viettelpost/report-undelivered
POST /api/viettelpost/import
POST /api/viettelpost/webhook
POST /api/telegram/webhook
```

Mac dinh cac endpoint doc du lieu cung duoc bao ve neu `PROTECT_READ_ENDPOINTS=true`.

## 16. Deploy len Firebase

Du an da co cau hinh Firebase Functions trong `firebase-entry.js` va `firebase.json`.

Xem file `FIREBASE_DEPLOY.md` de deploy. Neu gap loi Blaze, can nang cap Firebase project len Blaze truoc khi dung Functions, Cloud Build, Artifact Registry va Secret Manager.
