// Dựng menu-options.html (tĩnh, tự chứa) từ menu-options.src.html: nhúng logo + banner,
// chạy sẵn đoạn script dựng 3 khung điện thoại để file mở được cả ở nơi không chạy JS.
import fs from "node:fs";
const b64 = (p, m) => `data:${m};base64,${fs.readFileSync(new URL(p, import.meta.url)).toString("base64")}`;
let h = fs.readFileSync(new URL("menu-options.src.html", import.meta.url), "utf8");
h = h.replace("{{LOGO}}", b64("../../brand/yen-garden/logo.jpg", "image/jpeg")).replace("{{BANNER}}", b64("../../brand/yen-garden/banner.webp", "image/webp"));
const m = h.match(/<script>([\s\S]*?)<\/script>/);
const el = { innerHTML: "" };
new Function("document", m[1])({ getElementById: () => el });
h = h.replace(m[0], "").replace('<div class="row" id="row"></div>', `<div class="row" id="row">${el.innerHTML}</div>`);
fs.writeFileSync(new URL("menu-options.html", import.meta.url), h);
console.log("ok", h.length);
