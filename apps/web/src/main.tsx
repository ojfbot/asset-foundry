// Standalone entry point — renders the same Dashboard component the MF host
// (shell/) consumes via the federation remote. ADR-0010 §"single source of
// truth": the page loads at localhost:3035 (dev) AND at the shell's
// localhost:4000 (MF host) by importing the same component.
import "@carbon/styles/css/styles.css";
import React from "react";
import { createRoot } from "react-dom/client";
import Dashboard from "./components/Dashboard";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");
createRoot(root).render(
  <React.StrictMode>
    <Dashboard />
  </React.StrictMode>,
);
