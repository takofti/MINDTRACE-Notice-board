# Contributing

Mindtrace is an offline-first desktop board. Contributions should protect the board’s directness, readability and data safety before adding features.

## Ground rules

- Do not move cards automatically. Camera fitting is allowed only on an explicit action.
- Do not place permanent pins on cards. Pins appear only when connected or being used.
- Cards must remain visually above threads. Threads must not obscure card content.
- Do not turn the app into a mind-map, kanban or template-driven tool.
- Every visible control must work. No placeholder buttons.
- Do not add heavy effects at the cost of input responsiveness.
- Never weaken atomic saves, backups, close-flush or path validation.
- Add or update tests for board data integrity (delete a connected card, undo, import, etc.).

## Workflow

1. `npm install`
2. `npm run dev` (or `npm run dev:web` for renderer-only work)
3. Make the change with the same naming/style patterns as the surrounding code.
4. Run `npm run typecheck && npm test`.
5. Run `npm run e2e` for changes touching board interaction, storage or export.
6. Update `PROGRESS.md` and, if relevant, `ARCHITECTURE.md` and `CHANGELOG.md`.

## Style

- TypeScript strict mode.
- Plain JSON data; no class instances in persisted project data.
- Normalised records for cards/threads/strokes/groups.
- Small pure helpers in `core/`; side effects in `services/`; Zustand actions in `store/`.
- Keep the inspector compact and manual; avoid adding permanent chrome.

## Data changes

Any change to `Project`/`Space`/`Card` must:

- be optional or migrated in `normalizeProject()`;
- survive project archive import/export;
- be considered in undo snapshots and the exporter;
- be added to tests where data can be orphaned (e.g. a deleted card with threads).

## Releases

See [DEVELOPMENT.md](../DEVELOPMENT.md#release-process). Tags like `v1.0.1` trigger the Windows build workflow. Do not publish a release without verifying both the installer and portable executable.
