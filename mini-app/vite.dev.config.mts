import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Config dùng cho `npm run dev` (local browser, không cần Zalo env)
// Khác vite.config.mts (dùng cho zmp build/deploy với zaloMiniApp plugin)
export default defineConfig({
  root: ".",
  base: "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    open: false,
  },
});
