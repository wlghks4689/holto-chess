# Project runtime

- The application is the Cloudflare Workers app in `holto-chess/`. The repository
  root only delegates: every root npm script forwards to `holto-chess/`.
- To start the dev server, run `npm run dev -- --host 0.0.0.0` from the repository root.
- Verification lives in `holto-chess/`: `npm test`, `npm run test:workers`,
  `npm run lint`, `npm run build` (all reachable from the root too).
