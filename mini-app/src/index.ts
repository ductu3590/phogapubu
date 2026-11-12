// ZaUI stylesheet
import "zmp-ui/zaui.css";
// Tailwind stylesheet
import "@/css/tailwind.scss";
// Your stylesheet
import "@/css/app.scss";

// React core
import React from "react";
import { createRoot } from "react-dom/client";

// Mount the app
import MiniApp from "./app";
import { readThemeSeed } from "./stores/app.store";
import { applyPrimaryColor, applyTheme } from "./utils/theme-color";

// Áp theme + màu của lần mở trước TRƯỚC khi vẽ, để khung chờ đầu tiên đã đúng tông của quán.
const seed = readThemeSeed();
applyTheme(seed.theme);
if (seed.primary) applyPrimaryColor(seed.primary);

// Expose app configuration
import appConfig from "../app-config.json";

if (!window.APP_CONFIG) {
  window.APP_CONFIG = appConfig as any;
}

const root = createRoot(document.getElementById("app")!);
root.render(React.createElement(MiniApp));
