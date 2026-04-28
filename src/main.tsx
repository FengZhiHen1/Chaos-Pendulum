import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BootManager } from "@/features/system/init";
import App from "./App";
import "./styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BootManager
      config={{
        pyodideLoadStrategy: "lazy",
        enablePrecomputePrefetch: true,
        showQuotes: true,
      }}
    >
      <App />
    </BootManager>
  </StrictMode>,
);
