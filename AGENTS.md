# AGENTS.md

## Commands

- `npm run dev` — start Vite dev server
- `npm run build` — typecheck + production build (`tsc -b && vite build`)
- `npm run lint` — ESLint
- `npm install --legacy-peer-deps` — install dependencies (flag required by peer dep conflicts)

There is no test framework configured.

## Verification

Run in this order before committing:
1. `npm run lint`
2. `npm run build`

## Architecture

See `guidance.md` for detailed simulation logic and architecture overview.

- `src/lib/sim.ts` — simulation engine (world generation, weekly simulation, vote calculation)
- `src/types/sim.ts` — all type/interface definitions (`World`, `PoliticalValues`, etc.)
- `src/App.tsx` — top-level state and layout
- `src/components/` — UI (MapFigure, ConstituencyInspector, PartyWorkbench)

## Conventions

- TypeScript strict mode with `noUnusedLocals` and `noUnusedParameters` — no dead code allowed
- No comments in code unless requested
- Default branch is `master`
- Deployed to GitHub Pages via CI on push to `master`
