import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ModeApp } from "./ui/ModeApp";
import { initializeLocaleDocument } from "./i18n";
import "./ui/styles.css";
import "./ui/online.css";

initializeLocaleDocument();
createRoot(document.getElementById("root")!).render(<StrictMode><ModeApp /></StrictMode>);
