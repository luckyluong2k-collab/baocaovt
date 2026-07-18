# Chay bot bang GitHub Actions mien phi

## Cach hoat dong

GitHub Actions se tu mo may ao, cai Node.js, chay bot, gui Telegram, roi tat may ao.

Da tao 3 workflow:

- `.github/workflows/viettelpost-check.yml`: kiem tra canh bao moi gio, cron `17 * * * *`.
- `.github/workflows/viettelpost-undelivered-report.yml`: gui bao cao van hanh luc 07:00 va 20:00 gio Viet Nam, cron `0 0,13 * * *`.
- `.github/workflows/telegram-command-poll.yml`: doc lenh `/bc1` den `/bc5` moi 5 phut, cron `*/5 * * * *`.

Co the chay thu cong trong tab `Actions` cua GitHub bang nut `Run workflow`.

## Diem can luu y

GitHub schedule co the bi tre vai phut hoac lau hon khi he thong GitHub dong, nen khong dung cho canh bao can chinh xac tung phut.

Bot dung `actions/cache` de giu file `storage/viettelpost-db.json` giua cac lan chay, giup chong gui canh bao trung. Cach nay phu hop mien phi, nhung khong ben bang Firestore/server that.

## Buoc 1: Dua project len GitHub

Tao mot repository rieng, nen de private neu co du lieu don hang/SĐT.

Sau do push thu muc:

```powershell
cd "C:\Users\ADMIN\Documents\New project\viettelpost-telegram-bot"
git init
git add .
git commit -m "Add Viettel Post Telegram bot"
git branch -M main
git remote add origin https://github.com/<USER>/<REPO>.git
git push -u origin main
```

## Buoc 2: Cai GitHub Secrets

Vao repo tren GitHub:

```text
Settings -> Secrets and variables -> Actions -> New repository secret
```

Can tao:

```text
TELEGRAM_BOT_TOKEN
```

Neu co API Viettel Post that thi tao them:

```text
VIETTELPOST_TOKEN
VIETTELPOST_PASSWORD
GOOGLE_SHEET_CSV_URL
TRACKING_NUMBERS_CSV
```

`TRACKING_NUMBERS_CSV` co the chua noi dung CSV nhieu dong:

```csv
trackingNumber,orderCode,receiverName,receiverPhone,codAmount,acceptedAt,lastUpdatedAt,currentStatusCode,currentStatusName,deliveryAttempts,failedDeliveryReason
VTP001,DON001,Nguyen Van A,0901234567,1200000,2026-07-18T08:00:00+07:00,2026-07-18T10:00:00+07:00,IN_TRANSIT,Đang vận chuyển,0,
```

## Buoc 3: Cai GitHub Variables

Vao:

```text
Settings -> Secrets and variables -> Actions -> Variables -> New repository variable
```

Tao cac bien:

```text
TELEGRAM_CHAT_ID=-1003931579210
USE_MOCK_DATA=false
ORDER_SOURCE=api
TELEGRAM_DRY_RUN=false
MASK_PHONE=false
ENABLE_SCHEDULED_CHECK=false
SEND_DAILY_UNDELIVERED_REPORT=false
ENABLE_TELEGRAM_COMMAND_POLLING=true
VIETTELPOST_API_BASE_URL=https://partner.viettelpost.vn/v2
VIETTELPOST_TOKEN_LOGIN_PATH=/user/loginVTP
VIETTELPOST_LIST_ORDERS_PATH=/order/order-filter?page=1
VIETTELPOST_LIST_ORDERS_METHOD=POST
VIETTELPOST_LIST_ORDERS_DAYS_BACK=30
VIETTELPOST_ORDER_DETAIL_PATH=/core/orders/query?code=:trackingNumber
VIETTELPOST_ORDER_DETAIL_METHOD=GET
VIETTELPOST_CALL_LOG_PATH=/order/call-log?orderNumber=:trackingNumber
VIETTELPOST_CALL_LOG_METHOD=GET
VIETTELPOST_AUTH_HEADER=Token
VIETTELPOST_AUTH_SCHEME=raw
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

Khi muon bat chay tu dong:

```text
ENABLE_SCHEDULED_CHECK=true
SEND_DAILY_UNDELIVERED_REPORT=true
```

## Buoc 4: Chay thu cong

Vao tab `Actions`.

Chay:

- `Viettel Post - Bao cao don chua giao`
- `Viettel Post - Kiem tra canh bao`

Neu thanh cong, bot se gui tin vao group Telegram `Báo cáo vận hành VTP`.

## Buoc 5: Noi API Viettel Post that

Neu da co endpoint API that, dat:

```text
ORDER_SOURCE=api
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
```

Token/mat khau dat trong GitHub Secrets, khong dat trong Variables.

`VIETTELPOST_TOKEN` la ma API lay trong Partner Viettel Post. Bot se tu goi `/user/loginVTP` de doi ma API nay thanh token phien trong `data.token`, sau do dung header `Token` de goi cac API don hang.

## Luat bao cao hien tai

- Mien Bac va mien Trung: don chua giao thanh cong qua 3 ngay se vao bao cao.
- Mien Nam: don chua giao thanh cong qua 4 ngay se vao bao cao.
- COD: don da giao thanh cong qua 3 ngay nhung chua co doi soat se vao bao cao.
- Cuoc goi: ship goi khach qua 2 cuoc goi nho se vao bao cao.

## Lenh Telegram

Neu bat `ENABLE_TELEGRAM_COMMAND_POLLING=true`, GitHub Actions se doc lenh moi 5 phut. Luu y GitHub co the tre them vai phut khi he thong dong.

```text
/bc1  Don dang giao hang
/bc2  Don dang can xu ly
/bc3  Don cho phat lai
/bc4  Don giao qua 4 ngay
/bc5  Doanh thu luy tien da luu
```

Neu co server/webhook online thi bot co the tra loi gan nhu ngay lap tuc qua endpoint:

```text
POST /api/telegram/webhook
```

`/bc5` ghi doanh thu theo ma van don da giao co COD vao `viettelpost_revenue_ledger`, de lan sau van giu tong luy tien neu app Viettel Post xoa bot lich su cu.
