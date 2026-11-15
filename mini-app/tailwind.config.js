import tokens from "./src/tokens";
const plugin = require("tailwindcss/plugin");

module.exports = {
  darkMode: ["selector", '[zaui-theme="dark"]'],
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html",
    "./index.html",
  ],
  theme: {
    extend: {
      ...tokens,
    },
  },
  plugins: [
    // Biến thể theo bộ giao diện của quán (stores.mini_app_theme, mig 134):
    //   className="bg-surface garden:bg-background"
    // Class gốc là giao diện classic và KHÔNG đổi; `garden:` chỉ có hiệu lực khi <html data-theme="garden">.
    plugin(({ addVariant }) => {
      addVariant("garden", ':root[data-theme="garden"] &');
    }),
  ],
};
