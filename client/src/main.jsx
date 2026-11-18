import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
// TikTok Sans (SIL Open Font License), served from this app so the cover text looks the same everywhere.
import "@fontsource/tiktok-sans/latin-400.css";
import "@fontsource/tiktok-sans/latin-500.css";
import "@fontsource/tiktok-sans/latin-700.css";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
