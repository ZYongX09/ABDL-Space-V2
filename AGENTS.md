# AGENTS.md

## Commands

```bash
# Install dependencies (must cd into client/)
cd client && npm install

# Dev server (port 5173)
cd client && npm run dev

# Build (outputs to client/dist/)
cd client && npm run build

# Preview production build
cd client && npm run preview
```

No lint, typecheck, or test scripts exist. No CI workflows.

## Architecture

- **`client/`** — React 18 + Vite SPA (the entire app). Pages, components, API layer, styles all live here.
- **`client/functions/`** — Cloudflare Pages Functions. `/api/*` and `/oauth/*` are catch-all proxies that forward requests to the backend Worker at `abdl-space-api.zhx589.workers.dev`.
- **`functions/`** (root) — Duplicate of `client/functions/api/`. Only `client/functions/` is deployed with CF Pages.
- **`server/`** — Email verification routes (`email-routes.ts`) meant to be delivered to the friend's backend repo (`zhx589/abdl-space`). Not used by this project directly.
- **`migrations/`** — SQL migration files for the D1 database in the backend. Execute in the friend's backend repo.
- **`scripts/`** — One-off utility scripts (wiki image upload, URL merge).

**No backend runs in this repo.** The API lives in `zhx589/abdl-space` (a separate repo). When `VITE_API_BASE` is empty, the frontend runs in offline/localStorage mode.

## Key Files

- `client/src/api.js` — All API calls, caching, offline fallback (~1300 lines). Single source of truth for data fetching.
- `client/src/App.jsx` — Route definitions, lazy-loaded pages, global keyboard shortcuts.
- `client/src/styles/global.css` — CSS variables for 3 themes (light/dark/colorful), animations, all custom styles (~4200 lines).
- `client/tailwind.config.js` — Custom color palette, border radii, animations (MIUI/HyperOS style).
- `client/vite.config.ts` — Build timestamp injection, captcha key injection, functions copy to dist/.

## Conventions

- **Language**: All UI text is Chinese. Write comments and commit messages in Chinese if the codebase does so.
- **No daisyUI**: Tailwind only. Use utility classes + custom CSS variables from `global.css`.
- **Font Awesome 6**: Use `fa-solid` icons. Import via `@fortawesome/fontawesome-free`.
- **3 themes**: Every new color/style must work in light, dark, and colorful themes. Use CSS variables (`--primary`, `--accent`, etc.), not hardcoded hex.
- **MIUI/HyperOS motion**: Animations follow MIUI 12 style — elastic easing, staggered entry, smooth transitions. See existing animations in `tailwind.config.js`.
- **Mobile-first responsive**: Sidebar (PC) + bottom nav (mobile) + top header (mobile). Use `MobileHeader` and `MobileBottomNav` components.
- **Route titles**: Update `ROUTE_TITLES` in `App.jsx` when adding pages.
- **API proxy**: CF Pages Functions proxy `/api/*` to the backend. New backend endpoints work automatically — no proxy config changes needed.
- **Offline mode**: API functions should degrade gracefully when `VITE_API_BASE` is empty (localStorage fallback).

## Deployment

- **Frontend**: Cloudflare Pages (`abdl-space.top`). Build → `client/dist/`. The Vite plugin copies `client/functions/` into `dist/functions/` automatically.
- **Backend API**: Cloudflare Worker (`api.abdl-space.top`) in a separate repo. Do NOT deploy the wrong project — `abdl-space` and `abdl-space-v2` are different.
- **SPA fallback**: `client/public/_redirects` sends all non-API paths to `index.html`.
