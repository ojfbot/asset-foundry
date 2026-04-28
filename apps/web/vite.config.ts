// Vite config for the asset-foundry Frame MF remote (ADR-0010).
//
// Pattern matches lean-canvas/packages/browser-app (and the rest of the Frame
// remotes): @originjs/vite-plugin-federation + cssInjectedByJs (which MUST
// come before federation in the plugin list).
//
// Port allocation per ADR-0010:
//   3035  this dev server (vite)
//   3036  asset-foundry MCP HTTP server (`pnpm foundry mcp-http`)
//
// The browser app's MCP client (src/lib/mcp-client.ts) calls into :3036 by
// default, falling back to a same-origin relative URL when served as an MF
// remote inside the shell at :4000 — in that case, an upstream proxy or the
// shell's environment must route /mcp to the foundry HTTP server.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import cssInjectedByJs from "vite-plugin-css-injected-by-js";
import federation from "@originjs/vite-plugin-federation";

export default defineConfig({
  plugins: [
    react(),
    // foundry-agnostic-disable-next-line: required ordering, see lean-canvas comment
    cssInjectedByJs({
      jsAssetsFilterFunction: (outputChunk) =>
        outputChunk.fileName.includes("__federation_expose_"),
    }),
    federation({
      name: "asset_foundry",
      filename: "remoteEntry.js",
      exposes: {
        "./Dashboard": "./src/components/Dashboard",
      },
      // Versions must match shell/vite.config.ts. ADR-0010 §MF remote shape.
      shared: {
        react: { singleton: true, requiredVersion: "^18.3.0" },
        "react-dom": { singleton: true, requiredVersion: "^18.3.0" },
        "@carbon/react": { singleton: true, requiredVersion: "^1.67.0" },
      },
    }),
  ],
  server: {
    port: 3035,
    cors: true,
  },
  preview: { port: 3035 },
  build: {
    target: "esnext",
    minify: false,
  },
});
