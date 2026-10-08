# Cinematic entrance — 2026-10-08

## Existing flow and scope

Google authenticates in the Worker callback and resolves the account through `/api/auth/me`.
Guest explicitly opts in locally. A complete Google profile or Guest choice opens the home menu;
Single/Multi selection remains a separate step. Auth cookies, D1, WebSocket sessions, game rules,
invites, reconnection, legal links, and room identity logic are unchanged by this UI task.

## Implementation

Source owners: `StartScreen.tsx`, `start-screen.css`, `ModeApp.tsx`, `AccountLogin.tsx`,
`AccountProvider.tsx`, new `EntranceLayer.tsx`, `entryIntent.ts`, DEV `EntrancePreview.tsx`.
Tests: `AccountLogin.test.ts`, new `entryIntent.test.ts`. Assets: six new files under
`holto-chess/public/assets/start/` (four WebP stills and two MP4 videos).

- Supplied gate stills → login; supplied interior stills → authenticated home.
- Supplied desktop/mobile H.264 MP4s: 3.065 seconds, respectively 1280×720 and 720×1280.
- Stills converted to WebP, approximately 364–379 KB each. Videos preserved as supplied.
- Existing `(orientation: portrait) and (max-width: 820px)` rule selects mobile assets.
  Video selection freezes when playback starts. `object-fit: cover`, center positioning.
- Visual entry intent is stored for OAuth redirect continuity (15-minute expiry). It confers
  no account access. Playback requires existing `canEnter` verification. Failures clear intent;
  completed/reloaded sessions with no intent go straight to home.
- Only selected video preloads, muted and playsInline. Next interior still also preloads.
- Login UI fades for 200ms; playback begins after 150ms. Last 220ms crossfade into prepared
  interior background; home UI appears after the layer completes.
- Load/play rejection/error: 500ms fallback, 2-second initial playback timeout, absolute
  8-second stall watchdog. OS reduced motion or existing motion-disabled setting: 250ms fade.
- Home is inert during entry. Video pauses and unmounts at completion. Invite game components
  mount afterward so introduction does not advance game state.
- `/entrance-preview` is DEV-only and supplies Google success/failure, video failure and reduced
  motion fixtures. No fake authentication cookie, account or room is created.

## Validation

- Full Vitest suite: 108 files, 766 tests passed, with maxWorkers=2 and testTimeout=120000.
- Focused login/entry conditions: 8 tests passed. Lint and production build passed.
- Real built Worker UI at `http://127.0.0.1:8787/`: Desktop/portrait Guest playback,
  home completion, reload skips replay, no residual video element.
- DEV fixture: Google success after verification, auth failure retains login error/gate,
  failed video completes fallback, reduced motion creates no video.
- Login layout checked at 360×780, 375×812, 393×852, 402×874, 1280×720, 1440×900,
  1920×1080. Correct selected assets, centered controls, no horizontal overflow.
- Actual Google provider login and physical iOS Safari were not tested: local OAuth secrets
  are absent. Inline attributes are implemented and desktop Chromium playback is verified.
- No deployment or Git delivery performed in this task.
