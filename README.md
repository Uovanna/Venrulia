# Realms of Eldoria

A single-file React idle RPG. The whole game lives in `src/App.jsx`; everything
else is thin scaffolding to build and deploy it.

## Structure

```
.
├── index.html          # Vite entry; loads Supabase (UMD global) + mounts the app inline
├── src/
│   └── App.jsx         # THE GAME (single source of truth)
├── vite.config.js      # Vite + @vitejs/plugin-react
├── netlify.toml        # Netlify build settings
├── package.json
└── .gitignore
```

React and ReactDOM are bundled from npm. The React entry is **inlined into
`index.html`** (a small module script that imports `./src/App.jsx` and mounts it),
so there is no separate `main.jsx` file to go missing. **Supabase is loaded as a
CDN UMD global** (`window.supabase`) via the `<script>` tag in `index.html` —
`App.jsx` reads it from `window`, so it is intentionally not imported. The Supabase
URL and **publishable (anon) key are public by design** and live inline in `App.jsx`.

## Local development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # → dist/
npm run preview  # serve the production build locally
```

## Deploy to Netlify

**Option A — Git (recommended):** connect this repository in Netlify. Settings
are auto-detected from `netlify.toml`:

- Build command: `npm run build`
- Publish directory: `dist`
- Node version: `20`

Push to the default branch and Netlify builds + deploys automatically.

**Option B — drag & drop:** run `npm run build` locally and drop the resulting
`dist/` folder into the Netlify dashboard.

## Zero-build fallback

`standalone/realms-of-eldoria.html` (if present) is a fully self-contained build
— no bundler required. Rename it to `index.html` and publish it as a static site
for an instant deploy.
