# Viettel Post Telegram Bot

Bot Node.js theo doi van don Viettel Post va gui canh bao Telegram.

Firebase project hien tai: `baocaovt-e3ca9`.

Luat bao cao hien tai:

- Mien Bac/Mien Trung qua 3 ngay chua giao.
- Mien Nam qua 4 ngay chua giao.
- COD qua 3 ngay sau khi giao ma chua doi soat.
- Ship goi khach qua 2 cuoc goi nho.

Lich GitHub Actions: tu dong gui bao cao luc 07:00 va 20:00 gio Viet Nam.

Lenh Telegram da ho tro khi co webhook/server online:

- `/bc1`: don dang giao hang.
- `/bc2`: don dang can xu ly.
- `/bc3`: don cho phat lai.
- `/bc4`: don giao qua 4 ngay.
- `/bc5`: doanh thu luy tien da luu.

Chay nhanh bang mock data:

```powershell
cd "C:\Users\ADMIN\Documents\New project\viettelpost-telegram-bot"
npm install
npm test
npm run check
npm run report:undelivered
npm start
```

Tai lieu chi tiet nam trong `VIETTELPOST_BOT_SETUP.md`.

Deploy Firebase xem them `FIREBASE_DEPLOY.md`.

Chay mien phi bang GitHub Actions xem `GITHUB_ACTIONS_SETUP.md`.
