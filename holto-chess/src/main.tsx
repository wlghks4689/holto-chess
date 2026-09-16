import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ModeApp } from "./ui/ModeApp";
import "./ui/styles.css";
import "./ui/online.css";

createRoot(document.getElementById("root")!).render(<StrictMode><ModeApp /></StrictMode>);
