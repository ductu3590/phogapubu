// Dựng các trang phương án (HTML tĩnh, tự chứa) cho Yên Garden:
//   menu-options.html      ← menu-options.src.html (3 bố cục màn Thực đơn)
//   quick-add-options.html ← phần đầu (CSS + icon) của menu-options.src.html + quick-add.body.html
// Nhúng logo + banner và chạy sẵn đoạn script dựng khung điện thoại, để file mở được cả ở nơi
// không chạy JS. Chạy: node docs/design/yen-garden/build.mjs
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const b64 = (p, m) => `data:${m};base64,${fs.readFileSync(new URL(p, import.meta.url)).toString("base64")}`;
const LOGO = b64("../../brand/yen-garden/logo.jpg", "image/jpeg");
const BANNER = b64("../../brand/yen-garden/banner.webp", "image/webp");

function render(html, out) {
  let h = html.replace("{{LOGO}}", LOGO).replace("{{BANNER}}", BANNER);
  const m = h.match(/<script>([\s\S]*?)<\/script>/);
  const el = { innerHTML: "" };
  new Function("document", m[1])({ getElementById: () => el });
  h = h.replace(m[0], "").replace('<div class="row" id="row"></div>', `<div class="row" id="row">${el.innerHTML}</div>`);
  fs.writeFileSync(new URL(out, import.meta.url), h);
  console.log(out, h.length);
}

const src = read("menu-options.src.html");
render(src, "menu-options.html");

// Trang vị trí nút gọi thêm: mượn <head> + bộ icon của trang trên, thân trang riêng.
const head = src.slice(0, src.indexOf('<div class="page">')).replace("3 phương án màn Thực đơn", "nút gọi thêm bia: 3 vị trí");
render(head + read("quick-add.body.html"), "quick-add-options.html");
