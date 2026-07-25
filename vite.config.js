import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Single-page app. React/ReactDOM are bundled from npm; Supabase is loaded as a
// UMD global (window.supabase) from the CDN <script> in index.html, so it is
// intentionally NOT imported here.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    // one big self-contained bundle keeps parity with the standalone target
    chunkSizeWarningLimit: 2000,
  },
});
