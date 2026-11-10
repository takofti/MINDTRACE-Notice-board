# Development

## Requirements

- Windows 10/11 (the product target; renderer code is platform-neutral)
- Node.js 22+ (24 recommended)
- npm 10+
- For packaging: network access on first run so electron-builder can fetch NSIS tooling

## Setup

```powershell
npm install
npm run dev
```

`npm run dev` starts electron-vite, launches the Electron window and opens DevTools detached. Prefer `npm run dev:web` when you want the renderer in a normal browser tab; the storage adapter falls back to localStorage + IndexedDB and assets become blob URLs.

The first launch of a fresh data folder seeds the demonstration project. All desktop data lives in `%APPDATA%\Mindtrace\data` unless `MINDTRACE_USER_DATA` is set.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Electron + Vite development |
| `npm run dev:web` | Renderer-only dev server on `http://localhost:5183` |
| `npm run typecheck` | `tsc` for main/preload and renderer |
| `npm test` | Vitest unit tests |
| `npm run e2e` | Build, then run the Playwright-driven Electron smoke test |
| `node scripts/ui-e2e.mjs` | Real Electron UI checks: settings/theme, modes, filters, context menu, resize, pins, thread selection |
| `node scripts/packaged-smoke.mjs` | Launch a packaged build and verify board, search and PDF rendering under the packaged CSP |
| `npm run build` | Production bundles in `out/` |
| `npm run dist` | Build + electron-builder NSIS installer and portable exe |
| `npm run dist:dir` | Unpacked Windows app for quick inspection |
| `npm run icon` | Regenerate `build/icon.ico` from the committed 256px PNG |

## Project map

```
src/main/index.ts        window, IPC, storage, zip import/export, asset protocol
src/preload/index.ts     typed window.mindtrace bridge
src/shared/              project/data types and settings schema
src/renderer/src/
  App.tsx                boot, shell, autosave and close-flush wiring
  components/Board.tsx   viewport, gestures, draws layers, drop import
  components/CardView    card types, pins, rich text, media and documents
  components/ThreadsLayer / StrokesLayer / GroupLayer / Minimap
  store/board.ts         normalized project state, selection, undo, clipboard
  store/settings.ts      settings + profiles + appearance application
  store/ui.ts            modals, context menu, toasts, interaction flag
  core/                  geometry, camera, threads, stroke paths, migrations
  services/              storage adapter, bootstrap/autosave, exporter, events
  hooks/                 hotkeys, asset URL resolution
  styles/global.css      visual system and board surface
scripts/e2e.mjs          real Electron smoke test
scripts/make-icon.*      icon generation
```

## Adding a card kind

1. Add the id to `CardKind` in `src/shared/types.ts`.
2. Size/defaults go in `defaultCardSize()`/`newCard()` in `src/renderer/src/core/defaults.ts`.
3. File detection goes in `classifyFile()`.
4. Render the card in `CardView.tsx`; keep drag handles/headers semantic and mark real controls with `data-interactive`.
5. Add an exporter branch in `services/exporter.ts`.
6. Add a filter option in `FilterDialog.tsx` if relevant.
7. Add a unit or E2E check.

No canvas engine changes should be necessary.

## Adding a drawing tool

1. Extend `ToolId`/`Stroke['tool']`.
2. Add the rail button in `ToolRail.tsx`.
3. Handle its gesture in `Board.startDrawing`/preview completion.
4. Add a path branch in `core/strokes.ts` and a canvas branch in the exporter.
5. Test eraser behaviour for the new tool.

## Testing

### Unit tests

`npm test` covers geometry/pin anchors, group bounds, eraser splitting, camera transforms, and store-level card/thread/group/clipboard/undo behaviour. No DOM or Electron is required beyond jsdom.

### Desktop smoke test

`npm run e2e` builds the app and launches the real Electron binary with an isolated fresh data folder:

- demo project loads;
- double-click note, drag, undo;
- tie a thread from a connected pin;
- draw chalk;
- drop a generated PNG and verify it loads through `mtasset://`;
- drop a generated PDF and verify PDF.js renders it;
- drop a minimal DOCX and verify Mammoth converts its text;
- autosave writes `project.json` + assets;
- manual snapshot exists on disk;
- project archive exports and re-imports with rewired assets;
- close/relaunch preserves cards;
- no renderer console/page errors.

Screenshots are written to `test-artifacts/` (ignored by git). The test can be extended by patching native dialogs in the main process:

```js
await app.evaluate(({ dialog }, path) => {
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: path })
}, exportPath)
```

## Release process

1. Update `package.json` version (semver) and replace the placeholder repository URL with the real GitHub URL.
2. Update `CHANGELOG.md`.
3. Run:
   ```powershell
   npm run typecheck
   npm test
   npm run e2e
   npm run dist
   ```
4. Inspect `release/Mindtrace-Setup-<version>.exe` and `Mindtrace-Portable-<version>.exe`.
5. Commit, tag `v<version>` and push. The GitHub Actions workflow builds the same artifacts and attaches them to the GitHub Release.
6. Install once on a clean Windows 10/11 machine if possible: choose folder, desktop shortcut, run-after-install and uninstall through Windows Settings.

## Storage and data-safety rules

- Write project/settings files atomically; never truncate the live file.
- Keep a backup before risky operations (restore, import, large space deletion).
- Prune backups only after a successful new backup.
- Validate archive paths and project ids; never resolve user-provided names outside the project folder.
- The renderer must not access Node APIs directly; go through `window.mindtrace`.
- Keep the close-flush and 2.5 s watchdog working. A stuck window is worse than a slightly delayed close, but a lost edit is worse than both.

## Known development notes

- The browser harness cannot use `ResizeObserver` reliably in some embedded panes; the Board has an explicit layout measurement fallback (`getBoundingClientRect` + resize/timeout) for exactly this reason.
- `npm run dev:web` is for UI work only; it is not a shipped distribution target.
- Video and PDF preview fidelity depends on Chromium's native media/PDF support.
- Undo history is intentionally session-scoped. Use snapshots for durable recovery.
- Do not add a license file until the owner chooses one; see `docs/LICENSE-PROPOSAL.md`.
