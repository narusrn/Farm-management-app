# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start dev server at localhost:3000
npm run build    # production build
npm run lint     # run ESLint
```

TypeScript build errors are intentionally ignored (`ignoreBuildErrors: true` in `next.config.mjs`) — the app still deploys with TS errors present.

## Architecture

This is a **single-page LINE LIFF application** for rice farm management. All UI lives in one file: `app/page.tsx`.

### Screen flow

The app has four screens controlled by a `currentScreen` state (`"farms" | "draw" | "form" | "preview"`):

1. **farms** — list of user's farms
2. **draw** — Leaflet map where user clicks to place a marker (farm location)
3. **form** — fill in farm details (name, rice variety, planting date, disease notifications)
4. **preview** — read-only map view of a saved farm

### API layer

All API calls go through `app/api/routes/` — these are **client-side service modules**, not Next.js route handlers:

- `app/api/routes/user.ts` — `getUser(lineUserId)` — fetches user profile
- `app/api/routes/farm.ts` — `getFarms / createFarm / updateFarm / deleteFarm` — CRUD for farms

**All functions are currently dummy implementations using `localStorage`.** Each has a clearly marked `── REPLACE THIS BLOCK ──` comment with the real `fetch` call ready to uncomment when the backend API is available. The target API base URL is `https://www.nectec.or.th/innovation/innovation-service/digital-agri-api`.

### CORS proxy

The NECTEC rice phenotype API blocks browser requests. `app/api/rice/route.ts` is a real Next.js server-side route handler that proxies `GET /rice/phenotype` with the API key, called from `page.tsx` as `/api/rice`.

### Maps

Leaflet.js and leaflet-draw are loaded via **CDN** (not npm) inside `page.tsx`. Because of this, all map refs are typed as `any` and `window.L` is declared as `any` in the global type declaration. Do not attempt to import from the `leaflet` npm package.

### LIFF (LINE Frontend Framework)

The LINE LIFF SDK is also loaded via CDN script tag. On `localhost`, the app bypasses LIFF login and uses `mock_user_123` as the userId automatically. On production, it calls `window.liff.getProfile()` to get the LINE user's `userId` and `displayName`.

### Data types

Core types are defined in the route files and imported into `page.tsx`:
- `Farm` and `FarmPayload` — exported from `app/api/routes/farm.ts`
- `UserProfile` — exported from `app/api/routes/user.ts`
- `RiceVariety` — defined locally in `page.tsx` (from NECTEC API response)

### Path alias

`@/*` maps to the project root, so imports use `@/app/api/routes/farm` etc.
