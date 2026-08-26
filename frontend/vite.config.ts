import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Vite only exposes VITE_-prefixed env vars to the client by default;
  // GOOGLE_ADDRESS_API_KEY is opted in explicitly here rather than renamed.
  envPrefix: ["VITE_", "GOOGLE_ADDRESS_API_KEY"],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})