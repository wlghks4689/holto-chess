# Project runtime

- The application is the Cloudflare Workers app in `holto-chess/`. The repository
  root only delegates: every root npm script forwards to `holto-chess/`.
- To start the dev server, run `npm run dev -- --host 0.0.0.0` from the repository root.
- Verification lives in `holto-chess/`: `npm test`, `npm run test:workers`,
  `npm run lint`, `npm run build` (all reachable from the root too).

## Working scope

- Primary app: `holto-chess/`.
- Ignore unless explicitly requested:
  - legacy root app
  - `node_modules`
  - `dist`
  - generated files
- Do not scan the whole repository for small UI tasks.
- Prefer targeted grep/read/edit.
- Do not run build repeatedly.

## Collaboration and balance analysis

- Follow `product_doc/README.md` for the collaboration contract and approval gates.
- Codex owns planning, development, tests, integration, shared TODO and decisions.
- The user gives final approval for game direction, rules and balance changes.
- Claude is an analysis assistant, not a game developer or design authority.
- Track executable work in `product_doc/TODO.md`; record approved decisions in
  `product_doc/DECISIONS.md`. Analysis requests live under `product_doc/balance/`.
- Preserve other tasks' changes. Never integrate an analysis branch wholesale.
