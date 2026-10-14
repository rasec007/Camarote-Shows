import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA({ registerType: "autoUpdate", includeAssets: [], manifest: {
    name: "Camarote Shows", short_name: "Camarote", description: "Gestão de eventos e agenciamento",
    theme_color: "#0205D3", background_color: "#FFFFFF", display: "standalone", start_url: "/",
    icons: [{ src: "/app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
  } })],
});
