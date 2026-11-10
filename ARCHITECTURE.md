# Architecture

Mindtrace is an Electron desktop app with a deliberately small number of moving parts. The board is the product; the architecture exists to keep it direct, fast and recoverable.

## Process model

```
┌───────────────────────────── Electron main ─────────────────────────────┐
│ window lifecycle · native dialogs · project/asset files · backups · zip │
│ PNG/PDF save · mtasset:// protocol · single-instance lock · CSP          │
└───────────────▲──────────────────────────────────────────────────────────┘
                │ contextBridge (typed, no Node in renderer)
┌───────────────┴──────────────────────────────────────────────────────────┐
│ preload: window.mindtrace API                                            │
└───────────────▲──────────────────────────────────────────────────────────┘
                │
┌───────────────┴──────────────────── React renderer ─────────────────────┐
│ stores   board (project, selection, undo) · settings · ui                │
│ engine   camera · geometry · threads · strokes · culling                 │
│ views    TitleBar · ToolRail · Board · Inspector · Settings · dialogs    │
│ services storage adapter · bootstrap/autosave · exporter · events        │
└──────────────────────────────────────────────────────────────────────────┘
```

- `src/main` is the only place with filesystem access. It exposes a narrow set of IPC handlers.
- `src/preload` exposes `window.mindtrace` via `contextBridge`. Renderer runs with `contextIsolation: true`, `sandbox: false`, `nodeIntegration: false`.
- `src/shared` holds the plain-JSON project/data model and settings schema used by both sides.
- `src/renderer` contains everything visual and interactive.

The renderer has a browser fallback storage adapter (`src/renderer/src/services/storage.ts`) used by `npm run dev:web` and by the UI smoke tests. Packaged builds use the Electron adapter. This is also the seam for future Linux builds: the core does not assume Windows APIs.

## Board data model

A `Project` owns spaces, project-level categories and metadata. A `Space` owns records (maps) of cards, threads, strokes and groups plus a camera. Records give O(1) updates by id and stable React keys.

```ts
Project
  spaces: Space[]
  categories: Category[]
Space
  camera: { x, y, zoom }
  cards: Record<CardId, Card>
  threads: Record<ThreadId, Thread>
  strokes: Record<StrokeId, Stroke>
  groups: Record<GroupId, Group>
Card
  kind, x, y, w, h, z, title, body(html), assetUrl, caption, style
  categories, pins, groupId, locked, hidden
Thread
  from:{cardId,pinId}, to:{cardId,pinId}, color,width,style,label,curve
Stroke
  tool, color, width, opacity, points:[x,y,…], locked, hidden
```

The persisted file is plain JSON with `format: 2`. `normalizeProject()` tolerates older/looser projects (array card collections, missing fields, dropped threads) and is run on every load. The model is deliberately free of class instances so it can be archived, inspected and migrated.

### Pin and thread mechanics

- Each card has **eight implicit anchors** (`n`, `ne`, `e`, …) expressed in normalised card coordinates.
- `card.pins` stores additional custom pins (`id`, normalised `x/y`). `Alt` + click creates one at the exact point.
- A thread stores `{ cardId, pinId }` on each end, not screen points. Moving or resizing a card recomputes both pin positions; moving a group moves its cards; collapsing a group changes the endpoint to an edge anchor on the collapsed frame.
- Pins are rendered as part of the card, so they scale and clip correctly. Only **connected** pins are always visible. A card reveals its unused anchors on hover/selection; while a thread is being dragged all visible cards reveal their anchors. A separate setting can require exact-pin drops instead of nearest-pin snapping.
- Thread geometry is a cubic Bézier. Control points are pushed outward along each pin's normal, bowed by the thread's `curve`, given a small gravity sag, and fanned by lane index when several threads share a pin. This reduces overlap without ever moving a card.
- The thread layer is SVG below the card layer. A wide transparent hit path makes thin threads easy to click. Labels and colour live on the thread itself.
- Removing a card removes every thread attached to it in the same undoable transaction. A custom pin can also be removed with its threads from the inspector.

## Rendering strategy

The viewport is one transformed “world” element:

```
screen = (world - camera) * zoom + viewport/2
```

Layers, bottom to top:

1. CSS board surface/texture image and vignette (screen-fixed).
2. Canvas grid (redrawn on camera change; spacing doubles when zoomed far out).
3. Group frames (world coordinates).
4. Chalk/ink SVG (culled to the visible world rectangle).
5. Thread SVG (culled by curve bounds; pinned to card coordinates).
6. Card DOM (`translate3d`, z-index by card z). DOM is used because rich text, video controls, PDF frames and accessible inputs are native there.
7. Overlay SVG for thread preview / target feedback, plus screen-space marquee and eraser cursor.

**Cards always paint above threads**, and thread endpoints terminate at card borders, so threads cannot cover card content.

### Readability

- At `zoom < board.lodThreshold` (default 38%), card interiors fade and a screen-space label layer shows readable titles/colours. Labels are greedily de-overlapped.
- Overview mode enables the same simplification regardless of zoom and thins threads.
- Focus mode computes a BFS neighbourhood from the selected card/thread (`focusDepth`) and dims unrelated cards, threads, groups and drawings while keeping everything visible.
- Selecting any card makes its direct threads full-strength and dims unrelated ones to `board.threadDim`; selecting a thread highlights it.
- Off-screen cards/threads/strokes are culled using the visible world rectangle plus a configurable margin. `memo()` on cards and a stable connected-pin index avoid re-rendering every card while panning.

## Undo / redo

Undo is snapshot-backed at the data level, with no camera state in snapshots:

- Discrete actions capture the affected project data before applying.
- Drags, resizes, text editing and slider gestures use `beginHistory()`/`commitHistory()` so a whole interaction is one undo step; no-op gestures are discarded by comparing signatures.
- A transaction only stores project spaces, categories and the active space id. Undo restores spaces/categories and keeps the current cameras. Selection is pruned and the active space follows the action.
- History is session-scoped (not written to disk). Project files and snapshots are the durable history.
- The same code paths are used for keyboard undo/redo and the inspector/toolbar buttons.

## Persistence

- One folder per project: `project.json`, `assets/`, `backups/`.
- Assets are copied on import (dialog or drag/drop). A custom `mtasset://<projectId>/<filename>` protocol streams files with CORS enabled. Renderer never receives filesystem paths except through explicit “open/reveal” IPC.
- Saves are serialized per project, written to a temp file, fsynced and renamed. The current file is backed up before major writes. Backups are pruned to the configured count.
- Autosave is debounced (default 1.2 s) and disabled/configured in Settings. A save queue coalesces changes during an in-flight write.
- The main process intercepts window close, asks the renderer to flush, then closes. A 2.5 s watchdog prevents a stuck close. A `session.json` marker distinguishes a crash from a clean exit and powers the recovery banner.
- Project export/import is a ZIP (`.mndtr`) with `project.json`, `manifest.json` and assets. Imported projects get new ids and all `mtasset` URLs are rewritten. Zip paths are sanitised, entries bounded, and total asset size capped.
- Snapshot restore first backs up the current project, then replaces it, then reloads through the normal project loader.

## Settings

`AppSettings` is a versioned schema in `src/shared/settings.ts` with deep-merge loading, so unknown future keys survive a round trip. The settings store applies appearance through CSS custom properties/data attributes, persists debounced to `settings.json`, and supports profiles (whole settings snapshots), per-section resets and import/export. Every exposed setting is consumed by a renderer/main code path; there are no decorative controls.

## Export

The image exporter is a deterministic canvas renderer separate from the DOM. It draws the surface, grid, group frames, threads (with labels and lanes), eraser-split strokes, cards, images, captions and pins at a configurable scale, then encodes PNG or wraps it in a single-page PDF with jsPDF. Positions and connections are therefore preserved exactly, including at 2×/3×. Video/PDF cards render as framed evidence placeholders in the image; the full media remains in the project archive.

## Security & future platforms

- Context isolation, no Node in renderer, typed preload, no navigation to remote pages, external URLs opened through the OS, CSP in packaged builds, sanitised archive paths, bounded imports.
- Filesystem, path and process assumptions are behind the storage adapter and main process. A Linux build would need only platform packaging and a Linux storage adapter, not a renderer rewrite.
- Card kinds are intentionally assembled from small pieces (`CardKind`, `defaultCardSize`, `classifyFile`, `CardView`, exporter branch). Adding a new kind does not require touching the canvas engine.
- Thread routing and perception are isolated in `core/threads.ts`; pin coordinates in `core/geometry.ts`; tools are a typed union in the board store. New tools and thread styles can be added without schema surgery.
