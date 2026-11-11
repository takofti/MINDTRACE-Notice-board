# Progress & verification

This file records what is actually implemented, how it was checked, and what remains. It is updated alongside the code, not used as marketing.

Last verified: 2026-11-11 · version 1.1.0

## Stage status

| Stage | Status | Notes / verification |
| --- | --- | --- |
| 1. Foundation | ✅ | Electron + React + TypeScript build; infinite canvas; cursor-centred wheel zoom; middle/Space pan; viewport culling; minimap; camera per space. `npm run typecheck`, build, E2E launch. |
| 2. Cards | ✅ | Text, sticky note, image, video, audio, PDF, DOCX/DOC, TXT/MD, generic file and link cards; move, resize, z-order, duplicate, copy/paste, lock, hide, captions, lightbox, rich-text toolbar. E2E drag + undo; browser checks for media. |
| 3. Pins & threads | ✅ | 8 implicit anchors + custom pins; hidden unless connected/hovered; drag-to-connect with target feedback; colour, width, style, label, curve, opacity, hide; auto fan/sag routing; cards above threads; connection highlight/dim. E2E ties a thread; unit tests cover pins/geometry. |
| 4. Drawing | ✅ | Chalk, marker, pencil, eraser (splits strokes), line, arrow, rectangle, ellipse; move/lock/hide/delete; colour/width/opacity; chalk grain optional. E2E adds a chalk stroke; unit tests cover split-erase. |
| 5. Organisation | ✅ | Multiple spaces with per-space cameras; project search; filters by text/category/type; groups (move/collapse/colour/ungroup); categories; minimap; Normal/Focus/Overview; chain selection with depth. Browser checks for search/group collapse. |
| 6. Storage | ✅ | Atomic saves; autosave; rolling backups; manual snapshots; restore; session/crash detection; undo/redo; close flush; settings persistence; project archive import/export. E2E verifies on-disk project, snapshot, export/import, restart. |
| 7. Extra media | ✅ | Video/audio native controls; PDF rendered with PDF.js (page navigation); DOCX via Mammoth; TXT/MD inline preview; file open/reveal. PDF.js + Mammoth previews verified end-to-end, as is image import. |
| 8. Performance/testing | ⚠️ mostly | Culling, LOD labels, memoized cards, bounded imports, rAF drawing preview, quality presets, reduce-effects switches. CSS `zoom` keeps text and lines crisp at every scale. 26 unit tests, 39 desktop E2E assertions and 16 UI E2E assertions pass. Large-board stress test (thousands of cards) is documented as pending; see below. |
| 9. Distribution | ✅ local / ⚠ publish | electron-builder produces the NSIS installer and portable exe. The 1.0.0 artifacts were verified by silent install, installed-app launch (including PDF.js under the packaged CSP) and silent uninstall; portable launch created `Mindtrace Data` beside the exe. 1.1.0 artifacts are rebuilt from the current source. GitHub Actions and the release workflow are present, but no remote exists in this workspace so no GitHub release has been published. |
| 10. 1.1 experience upgrade | ✅ | Home screen with project creation before the editor; built-in and custom templates (save, instantiate, delete); fully Russian UI with a scalable dictionary; Photoshop-style contextual tool options with independent per-tool settings, reset and remappable single-key tool shortcuts; visual colour editor (palette, hue, HEX, alpha); movable and hideable panels with saved layout; rebuilt export dialog (PNG/JPG/WebP/PDF, presets, manual size, aspect lock, transparency, preview); native dialogs follow the interface language. |

## Verified checks

Run `npm test` (26 tests), `npm run e2e` (39 assertions) and `npm run e2e:ui` (16 assertions). The current E2E output includes:

- home screen appears on launch and resumes the current project;
- demo board and titlebar load;
- note creation by double-click;
- card drag + undo;
- thread creation from a pin to a card;
- chalk drawing;
- PNG dropped through IPC, loaded via `mtasset://`;
- PDF dropped and rendered with PDF.js;
- DOCX dropped and converted by Mammoth;
- autosave writes project JSON and assets;
- manual snapshot on disk;
- custom template saved to disk, instantiated, listed and removed;
- project `.mndtr` export contains project + assets;
- project import creates a new project with rewired asset URLs;
- native PNG export through the Electron save dialog;
- restart preserves the board;
- no uncaught renderer errors.

The UI smoke test additionally covers thread hit-testing, Russian settings navigation, live theme switching, Focus/Overview modes, context menus, Russian filter UI, resize handles and custom pins. Browser checks covered the home screen, project manager, create-project dialog, per-tool option bars for every tool, the colour popover, the export dialog and live Russian/English switching (`scripts/check-i18n.cjs` reports 0 missing keys).

`npm run typecheck` passes for main, preload and renderer. `npm run build` succeeds.

## Installer / portable verification

The packaging configuration targets Windows x64. It has been executed locally:

- `release/Mindtrace-Setup-1.1.0.exe` — NSIS installer with install-directory selection, desktop shortcut, run-after-finish, uninstall entry.
- `release/Mindtrace-Portable-1.1.0.exe` — portable executable.
- `release/win-unpacked/` — unpacked build used for smoke testing.
- `release/Mindtrace-Setup-1.1.0.exe.blockmap` — update/block map artifact.

Verification performed for 1.1.0:

- Installer silent install into a temporary directory produced `Mindtrace.exe` and `Uninstall Mindtrace.exe`.
- The installed executable launched successfully and passed `scripts/packaged-smoke.mjs`: Russian demo board (9 cards, 7 threads), search, a dropped PDF rendered by PDF.js under the packaged CSP, local data file written, and no renderer errors.
- The same smoke test passed against `release/win-unpacked/Mindtrace.exe`.
- `Uninstall Mindtrace.exe /S` removed the application files.
- The portable executable launched and created `Mindtrace Data` (projects, templates, settings, session) beside the executable.
- Code signing is **not** configured, so Windows SmartScreen may warn. Signing certificates must be supplied by the publisher.

## Known limitations / honest gaps

- **Undo history is session-only.** Durable recovery is via autosave, backups and snapshots. A visual history browser is not implemented.
- **Project-specific visual profiles** are manual. Workspace profiles are global; applying a profile is one click, but projects do not automatically remember a profile.
- **Large-board stress** beyond the demo (thousands of cards/threads) has not been benchmarked on low-end hardware. Culling/LOD/caps exist, but a formal benchmark suite is pending.
- **PDF/DOCX preview** uses PDF.js for PDFs and Mammoth for DOCX. Complex DOCX layout is approximated; the Open file action is always available.
- **No cut command** yet; copy/paste + delete covers moving objects between spaces.
- **Global "hide all threads"** is not a separate switch; threads can be hidden individually or in bulk from the inspector/context menu, and Focus/Overview reduce visual noise.
- **Linux packaging** is not configured. The storage/main boundary and renderer are cross-platform, but only Windows targets are produced.
- **Auto-update** is not implemented. Releases are manual/CI-built.
- **Image downscaling on import** is not implemented; large images are loaded at native resolution. Preview quality settings are therefore limited to existing quality/effect toggles.
- **Undo of project metadata** (project name/description) is not part of board undo; it goes through the project manager.
- **Drop of `.mndtr` onto the board** creates a file card; import is via the project manager.
- **Search highlighting** shows matches but does not highlight specific words inside result snippets.
- A test-only dev handle (`window.__mindtrace`) is exposed only in Vite dev mode, never in packaged builds.

## Next sensible work

1. Stress/performance benchmark (5k cards, 3k threads, 500 images) and a profiling baseline.
2. Project-specific appearance presets and a history browser.
3. Richer PDF page rendering (pdf.js) and a DOCX fallback viewer.
4. Cut and cross-project system clipboard.
5. Linux packaging once Windows is signed/stable.
6. Auto-update and code signing.
7. Optional encrypted backups and cloud sync (explicit opt-in).
