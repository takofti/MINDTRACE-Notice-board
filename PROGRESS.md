# Progress & verification

This file records what is actually implemented, how it was checked, and what remains. It is updated alongside the code, not used as marketing.

Last verified: 2026-11-10 · version 1.0.0

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
| 8. Performance/testing | ⚠️ mostly | Culling, LOD labels, memoized cards, bounded imports, rAF drawing preview, quality presets, reduce-effects switches. 26 unit tests + full Electron E2E pass. Large-board stress test (thousands of cards) is documented as pending; see below. |
| 9. Distribution | ✅ local / ⚠ publish | electron-builder produced NSIS installer and portable exe. Silent install, installed-app launch (including PDF.js under the packaged CSP), and silent uninstall were verified. Portable launch created `Mindtrace Data` beside the exe. GitHub Actions and release workflow are present, but no remote exists in this workspace so no GitHub release has been published. |

## Verified checks

Run `npm test` (26 tests) and `npm run e2e` (33 assertions). The current E2E output includes:

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
- project `.mndtr` export contains project + assets;
- project import creates a new project with rewired asset URLs;
- native PNG export through the Electron save dialog;
- restart preserves the board;
- no uncaught renderer errors.

`npm run typecheck` passes for main, preload and renderer. `npm run build` succeeds.

## Installer / portable verification

The packaging configuration targets Windows x64. It has been executed locally:

- `release/Mindtrace-Setup-1.0.0.exe` — NSIS installer with install-directory selection, desktop shortcut, run-after-finish, uninstall entry.
- `release/Mindtrace-Portable-1.0.0.exe` — portable executable.
- `release/win-unpacked/` — unpacked build used for smoke testing.
- `release/Mindtrace-Setup-1.0.0.exe.blockmap` — update/block map artifact.

Verification performed:

- Installer silent install into a temporary directory produced `Mindtrace.exe` and `Uninstall Mindtrace.exe`.
- The installed executable launched successfully, rendered the demo board, ran search, and rendered a dropped PDF with PDF.js under the packaged CSP, with no renderer errors.
- `Uninstall Mindtrace.exe /S` removed the application files.
- The portable executable launched, extracted to a temporary location and stored its data in `Mindtrace Data` beside the portable exe.
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
