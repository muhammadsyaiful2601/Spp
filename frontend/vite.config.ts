import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  // Read `.env` from the repository root, the same file Laravel loads, so one
  // file configures both sides and a deployment cannot end up with a bundle
  // pointing at `127.0.0.1` because the second file was forgotten.
  //
  // `envDir` also decides which files are ignored: with this set, Vite reads
  // `../.env*` and no longer reads `frontend/.env.local`. Values that used to
  // live there belong in the root file now.
  envDir: fileURLToPath(new URL('..', import.meta.url)),

// Left at the Vite default on purpose: only `VITE_`-prefixed keys are inlined
  // into the browser bundle. The root file also holds server secrets such as
  // APP_KEY, the database password and the SMTP key, and that prefix is the
  // boundary keeping them server-side. Do not widen `envPrefix`.
})