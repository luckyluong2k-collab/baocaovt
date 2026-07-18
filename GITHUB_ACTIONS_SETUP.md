# Chay bot bang GitHub Actions mien phi

## Cach hoat dong

GitHub Actions se tu mo may ao, cai Node.js, chay bot, gui Telegram, roi tat may ao.

Da tao 2 workflow:

- `.github/workflows/viettelpost-check.yml`: kiem tra canh bao moi gio, cron `17 * * * *`.
- `.github/workflows/viettelpost-undelivered-report.yml`: gui bao cao don chua giao luc 08:10 gio Viet Nam, cron `10 1 * * *`.

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
ORDER_SOURCE=csv
TELEGRAM_DRY_RUN=false
MASK_PHONE=false
ENABLE_SCHEDULED_CHECK=false
SEND_DAILY_UNDELIVERED_REPORT=false
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
VIETTELPOST_API_BASE_URL=...
VIETTELPOST_LIST_ORDERS_PATH=...
VIETTELPOST_ORDER_DETAIL_PATH=...
```

Token/mat khau dat trong GitHub Secrets, khong dat trong Variables.
