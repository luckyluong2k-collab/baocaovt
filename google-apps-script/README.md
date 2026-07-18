# Google Apps Script cho bot Viettel Post

Sheet da cau hinh:

```text
https://docs.google.com/spreadsheets/d/122J1Dee1mtk74Ay7tuiunQBSgl-XWDHD2BUI3omfNxw/edit
```

## Cai dat

1. Mo Google Sheet tren.
2. Vao `Extensions -> Apps Script`.
3. Xoa noi dung mac dinh trong `Code.gs`.
4. Dan toan bo noi dung file `google-apps-script/Code.gs` vao.
5. Vao `Project Settings -> Script Properties`, them:

```text
TELEGRAM_BOT_TOKEN=<token bot Telegram>
VIETTELPOST_TOKEN=<API key Viettel Post>
```

Khong ghi 2 gia tri tren vao Google Sheet.

6. Chay ham `setup()` lan dau va cap quyen.

`setup()` se:

- Tao trigger gui bao cao luc 07:00 va 20:00.
- Dang ky menu lenh `/bc1` den `/bc5` cho Telegram.

## Lenh Telegram

```text
/bc1 - Liet ke don dang giao hang
/bc2 - Liet ke don dang can xu ly
/bc3 - Liet ke don cho phat lai
/bc4 - Liet ke don giao qua 4 ngay
/bc5 - Tong hop doanh thu luy tien
```

## Webhook Telegram

Neu muon bot tra loi gan nhu ngay lap tuc:

1. Trong Apps Script, bam `Deploy -> New deployment`.
2. Chon loai `Web app`.
3. `Execute as`: Me.
4. `Who has access`: Anyone.
5. Deploy va copy Web App URL.
6. Trong Apps Script, chay:

```javascript
setTelegramWebhook("WEB_APP_URL_VUA_COPY")
```

Sau do Telegram se goi `doPost(e)` moi khi group gui lenh.

## Du lieu

- `orders_snapshot`: anh chup don moi nhat bot doc duoc.
- `revenue_ledger`: so doanh thu luy tien theo ma van don da giao co COD.
- `logs`: log chay bot.
- `config`: cau hinh khong bi mat, co the chinh truc tiep.

`/bc5` cong don theo ma van don trong `revenue_ledger`; neu app Viettel Post xoa bot lich su cu, cac don bot da tung ghi van con trong sheet.
