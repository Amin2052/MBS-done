import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

/**
 * The portal is served from the same origin as `/api/v1` in production, so the session
 * cookie is SameSite=Strict without a CORS exception. In development the API runs on
 * 4000 and Vite proxies `/api` to it, which preserves that same-origin property.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    // The catalogs and the i18n core live in packages/config, outside this app's root.
    fs: { allow: [fileURLToPath(new URL("../..", import.meta.url))] },
    proxy: {
      "/api": { target: "http://127.0.0.1:4000", changeOrigin: false },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
  },
});
