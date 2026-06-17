import { createShell } from "../../shared/layout.js";
import React from "react";
import { createRoot } from "react-dom/client";
import { BOSS_NAME } from "./config.js";
import { DarkSoulsPage } from "./DarkSoulsPage.jsx";

export function renderDarkSoulsPage() {
  const { shell, main } = createShell({ title: BOSS_NAME, showHomeLink: true });
  const root = createRoot(main);
  root.render(React.createElement(DarkSoulsPage));

  return {
    element: shell,
    cleanup: () => root.unmount()
  };
}
