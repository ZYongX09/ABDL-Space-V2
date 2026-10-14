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

## 分支工作流（强制遵循）

> 本节优先于本文件其他任何涉及分支或发版的描述。日常开发与上线必须严格按此执行。

| 分支 | 角色 |
| :--- | :--- |
| `develop` | **标准开发分支**。所有日常开发成果先进这里；任何时刻都必须包含 `main` 的全部增量。 |
| `main` | **上线分支**（正式发布）。 |
| `feat/*`、`fix/*` | 并行功能分支，从 `develop` 切出，完成后合回 `develop`。 |
| `hotfix/*` | 紧急修复分支，从 `main` 切出。 |

1. **日常开发**：从 `develop` 切出 `feat/*`（或 `fix/*`），完成后合回 `develop`；合并后删除该分支（本地与远端）。
2. **发版**：**只有用户明确指示**时才把 `develop` 合并进 `main` 并推送。除此之外不得直接推送 `main`。
3. **紧急修复**：从 `main` 切出 `hotfix/*` → 修复 → 合回 `main` 并推送 → **随后必须把 `main` 合并回 `develop`**。
4. **不变式 `develop ⊇ main`**：`develop` 必须包含 `main` 的全部增量。发现落后时把 `main` 合并（或快进）进 `develop`；**不得**用 `git reset` 丢弃 `develop` 的独有提交。
5. **禁止 squash `develop` → `main`**：该合并必须用 merge 或 fast-forward。squash 会在 `main` 生成 `develop` 里不存在的新提交，直接破坏第 4 条不变式。
6. 功能提交一律先进 `develop`，不得直接堆到 `main`。

### 上线方式

远端 `main` 推送会触发 Cloudflare Pages 自动部署主站（abdl-space.top）——**推 `main` 即等于上线**，推送前必须确认构建/测试通过且已获用户指示。
