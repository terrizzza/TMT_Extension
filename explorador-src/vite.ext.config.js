import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

// Build de la app como página de extensión (sale en ../explorador)
export default defineConfig({
  base: "./",
  publicDir: false,
  plugins: [react()],
  build: { outDir: "../explorador", emptyOutDir: true },
});
