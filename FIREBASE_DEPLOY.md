# Deploy bot Viettel Post len Firebase

## Trang thai hien tai

Project da duoc cau hinh de deploy Firebase Functions vao Firebase project:

```text
baocaovt-e3ca9
```

Firebase CLI da duoc cai tren may va dang dang nhap bang:

```text
luckyluong2k@gmail.com
```

Neu deploy bi chan vi chua bat goi Blaze, Firebase se bao loi dang:

```text
Your project baocaovt-e3ca9 must be on the Blaze (pay-as-you-go) plan.
Required API cloudbuild.googleapis.com can't be enabled until the upgrade is complete.
```

## Viec can lam tren Firebase Console

1. Mo trang:

```text
https://console.firebase.google.com/project/baocaovt-e3ca9/usage/details
```

2. Nang cap project `baocaovt-e3ca9` len Blaze.
3. Bat/tao Cloud Firestore neu project chua co Firestore database.
4. Quay lai may nay va chay cac lenh ben duoi.

## Cai secret sau khi da bat Blaze

Chay tung lenh, Firebase CLI se hoi gia tri secret. Dan gia tri vao prompt, khong ghi vao file.

```powershell
firebase.cmd functions:secrets:set TELEGRAM_BOT_TOKEN --project baocaovt-e3ca9
firebase.cmd functions:secrets:set VIETTELPOST_TOKEN --project baocaovt-e3ca9
firebase.cmd functions:secrets:set VIETTELPOST_PASSWORD --project baocaovt-e3ca9
firebase.cmd functions:secrets:set ADMIN_API_KEY --project baocaovt-e3ca9
firebase.cmd functions:secrets:set VIETTELPOST_WEBHOOK_SECRET --project baocaovt-e3ca9
```

Neu chua co mat khau Viettel Post/webhook secret thi co the dien gia tri tam nhu `unused`, sau nay cap nhat lai.

## Deploy

```powershell
cd "C:\Users\ADMIN\Documents\New project\viettelpost-telegram-bot"
firebase.cmd deploy --only functions --project baocaovt-e3ca9
```

Sau khi deploy thanh cong, Firebase se in URL cua function `api`. Cac endpoint can dung:

```text
GET  /api/viettelpost/health
POST /api/viettelpost/check-now
POST /api/viettelpost/report-undelivered
POST /api/viettelpost/test-telegram
POST /api/viettelpost/webhook
```

## Lich chay tu dong

Da tao 2 Firebase scheduled functions:

- `scheduledCheck`: kiem tra canh bao moi 60 phut.
- `scheduledUndeliveredReport`: gui bao cao don chua giao luc 08:00 theo gio Viet Nam, nhung chi chay khi bat `SEND_DAILY_UNDELIVERED_REPORT=true`.

Mac dinh `scheduledCheck` dang bi khoa boi `ENABLE_SCHEDULED_CHECK=false` de tranh gui mock data khi chua co API Viettel Post that.

## Luu tru

Khi chay tren Firebase, bot dung Firestore:

- `viettelpost_orders`
- `viettelpost_order_events`
- `viettelpost_alerts`
- `viettelpost_bot_logs`

Khong luu Telegram token, mat khau hoac API token vao Firestore.
