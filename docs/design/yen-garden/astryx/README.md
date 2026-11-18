# Yên Garden — thử hướng Astryx (2026-11-18)

Bản vẽ thử giao diện Mini App theme `garden` bằng design system Astryx (`meta/astryx`, CLI `@astryxdesign/cli@0.7.16`).
Chưa đụng code Mini App.

- `so-sanh.html` — hiện tại ↔ hướng Astryx cho 6 màn + ghi chú. Mở thẳng file trong trình duyệt.
- `hien-tai/` — ảnh chụp theme garden đang chạy (chép từ `docs/testing/yen-garden/screens/`).
- `moi/` — ảnh bản vẽ Astryx, khung 390×844.
- `lab/` — nguồn bản vẽ: `App.jsx` + `app.css` (React 19 + linh kiện `@astryxdesign/core`) và
  `yengarden.settings.json` (theme tạo bằng `astryx experimental theme editor`, gốc `matcha`).

Dựng lại bản vẽ (ngoài repo, thư mục nháp):

```
npm i react@19.2.0 react-dom@19.2.0 @astryxdesign/core@0.7.16 @astryxdesign/theme-matcha@0.7.16 @stylexjs/stylex@0.19.1 @heroicons/react@2.2.0
npm i -D @astryxdesign/cli@0.7.16 vite@6.3.5 @vitejs/plugin-react@4.5.2
npx astryx experimental theme editor new yengarden --like matcha   # rồi set lại từng dòng trong settings.json
npx astryx theme add yengarden
```

Astryx đòi React 19 + StyleX nên KHÔNG đưa linh kiện của nó vào Mini App (React 18 + zmp-ui). Nếu duyệt, kiểu dáng được
chép tay bằng Tailwind vào các nhánh `garden` sẵn có.
