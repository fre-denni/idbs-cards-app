import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: "src",
  publicDir: "../public",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "src/index.html"),
        dashboard: resolve(__dirname, "src/dashboard.html"),
        admin: resolve(__dirname, "src/admin.html"),
        reset: resolve(__dirname, "src/reset.html"),
      },
    },
  },
});
