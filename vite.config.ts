import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// '.ngrok-free.app' allows any ngrok subdomain (free URLs change on every restart).
export default defineConfig({
  plugins: [react()],
  server: { allowedHosts: ['.ngrok-free.app'] },
  preview: { allowedHosts: ['.ngrok-free.app'] },
})
