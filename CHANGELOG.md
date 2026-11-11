# Changelog

## 1.1.0 — 2026-11-11

Experience upgrade. Existing projects open unchanged; settings, tool bindings, panel layout and export preferences migrate automatically.

- New home screen that opens before the editor: recent projects, project creation, import, built-in templates and saved custom templates.
- Built-in templates for investigation, research, study, planning and a blank board; any project can be saved as a reusable template, instantiated or deleted.
- Photoshop-style contextual tool options bar with independent per-tool settings, live board updates, per-tool reset and remappable single-key tool shortcuts with conflict detection.
- Visual colour editor with palette, hue, HEX input and alpha; no board object is created while editing colours.
- Reworked export dialog: preview, PNG/JPG/WebP/PDF/project archive, resolution presets, manual width and height, aspect lock, filename, quality and transparency. Custom backgrounds, textures, grid and vignette now export exactly as shown on the board.
- Crisp rendering at any zoom: text, images, threads and drawings stay sharp because the board inner layer uses CSS `zoom` while the outer world layer only translates.
- Fully Russian interface with a scalable dictionary and English fallback; native file dialogs follow the selected language.
- Movable, hideable and resettable tool rail, options bar and inspector; layout is persisted in settings.
- Fixed window behaviour: custom title bar, close/minimise/maximise, double-click maximise, resize, system menu and shadow.
- New text and note placement by click, thread tool, brush/eraser refinements, shape fill/radius/line styles and thread visual styles.
- Updated demo and starter content (Russian by default) and documentation.

## 1.0.0 — 2026-11-10

Initial Windows release.

- Infinite canvas with per-space cameras, pan/zoom, fit, minimap and viewport culling.
- Text, note, image, video, audio, PDF, document, file and link cards.
- Hidden-by-default pins with eight implicit anchors and unlimited custom pins.
- Cubic thread routing with fan-out, sag, colours, widths, styles, labels and hiding.
- Chalkboard drawing tools with partial eraser, shapes and independent drawing objects.
- Spaces, groups, categories, filters, project-wide search and connection-chain focus.
- Normal, Focus and Overview display modes with low-zoom readable labels.
- Undo/redo, copy/paste, duplicate, layer order, locking and hiding.
- Local atomic saves, autosave, rolling backups, manual snapshots, crash recovery and project archive import/export.
- High-resolution PNG and PDF board export.
- PDF.js in-card PDF rendering with page navigation; DOCX preview via Mammoth.
- Deep settings: board surface and textures, object defaults, themes, interaction, performance, data, keybindings and workspace profiles.
- Windows NSIS installer and portable build configuration, GitHub Actions release workflow.
