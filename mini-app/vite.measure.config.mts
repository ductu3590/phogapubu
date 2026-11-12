import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { gzipSync } from "zlib";

// Đo kích thước bundle: `npm run measure`. KHÔNG dùng để deploy (zmp deploy dùng vite.config.mts).
// In ra: từng chunk (thô + gzip), chunk nào nằm trong lần tải đầu (entry + import tĩnh),
// và mỗi gói npm chiếm bao nhiêu trong lần tải đầu — để biết nên tách / bỏ cái gì.

function pkgOf(id: string): string {
  const i = id.lastIndexOf("node_modules/");
  if (i < 0) return "(mã của app)";
  const rest = id.slice(i + "node_modules/".length).split("/");
  return rest[0].startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0];
}

function measure(): Plugin {
  return {
    name: "mevo-measure",
    generateBundle(_opts, bundle) {
      const chunks = Object.values(bundle).filter((c) => c.type === "chunk") as any[];
      const assets = Object.values(bundle).filter((c) => c.type === "asset") as any[];
      const byName = new Map(chunks.map((c) => [c.fileName, c]));
      const initial = new Set<string>();
      const walk = (name: string) => {
        if (initial.has(name)) return;
        initial.add(name);
        for (const dep of byName.get(name)?.imports ?? []) walk(dep);
      };
      chunks.filter((c) => c.isEntry).forEach((c) => walk(c.fileName));

      const kb = (n: number) => (n / 1024).toFixed(1).padStart(8);
      const gz = (s: string | Uint8Array) => gzipSync(s).length;
      const lines: string[] = ["", "=== CHUNK JS (thô kB | gzip kB | tải đầu?) ==="];
      let initRaw = 0, initGz = 0, allRaw = 0, allGz = 0;
      for (const c of chunks.sort((a, b) => b.code.length - a.code.length)) {
        const g = gz(c.code);
        const isInit = initial.has(c.fileName);
        allRaw += c.code.length; allGz += g;
        if (isInit) { initRaw += c.code.length; initGz += g; }
        lines.push(`${kb(c.code.length)} ${kb(g)}  ${isInit ? "ĐẦU " : "trễ "} ${c.fileName}`);
      }
      lines.push("", "=== CSS / ảnh ===");
      for (const a of assets.sort((x, y) => y.source.length - x.source.length)) {
        const isCss = a.fileName.endsWith(".css");
        lines.push(`${kb(a.source.length)} ${isCss ? kb(gz(a.source)) : "       -"}  ${a.fileName}`);
      }
      const perPkg = new Map<string, number>();
      for (const c of chunks) {
        if (!initial.has(c.fileName)) continue;
        for (const [id, m] of Object.entries<any>(c.modules)) {
          const p = pkgOf(id.replace(/\\/g, "/"));
          perPkg.set(p, (perPkg.get(p) ?? 0) + m.renderedLength);
        }
      }
      lines.push("", "=== GÓI TRONG LẦN TẢI ĐẦU (kB trước minify, để so tỉ lệ) ===");
      for (const [p, n] of [...perPkg].sort((a, b) => b[1] - a[1]).slice(0, 25)) lines.push(`${kb(n)}  ${p}`);
      lines.push(
        "",
        `TẢI ĐẦU JS: ${kb(initRaw).trim()} kB thô, ${kb(initGz).trim()} kB gzip (${initial.size} file)`,
        `TẤT CẢ JS: ${kb(allRaw).trim()} kB thô, ${kb(allGz).trim()} kB gzip (${chunks.length} file)`,
        "",
      );
      console.log(lines.join("\n"));
    },
  };
}

export default defineConfig({
  root: ".",
  base: "/",
  plugins: [react(), measure()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: { assetsInlineLimit: 0, reportCompressedSize: false, outDir: "node_modules/.mevo-measure", emptyOutDir: true },
  logLevel: "warn",
});
