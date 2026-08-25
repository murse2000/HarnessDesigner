import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/noto-sans-kr/400.css";
import "@fontsource/noto-sans-kr/500.css";
import "@fontsource/noto-sans-kr/600.css";
import "@fontsource/noto-sans-kr/700.css";
import App from "./rebuild2d/App2D";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import "./rebuild2d/rebuild2d.css";

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><AppErrorBoundary><App /></AppErrorBoundary></React.StrictMode>);
