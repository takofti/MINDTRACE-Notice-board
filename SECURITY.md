# Security

Mindtrace is an offline desktop application. It does not include analytics, telemetry, accounts or a remote backend.

## Data

- Projects, assets, settings and backups are stored under the local Mindtrace data folder (or `Mindtrace Data` next to a portable executable).
- Exported `.mndtr` archives contain the full project and assets; treat them as sensitive.
- Uninstalling the app does not delete project data.

## Renderer boundary

- Node integration is disabled; the renderer receives a narrow, typed contextBridge API.
- Paths are validated in the main process; asset references cannot escape the project folder.
- Archive import sanitises entry names, caps entry count/size and rejects oversized content.
- Remote navigation is blocked; external URLs are opened by the OS after scheme validation.
- Packaged builds apply a Content Security Policy.

## Reporting

If you find a vulnerability, please avoid publishing working exploit details before the maintainer has had a chance to respond. Use the repository’s private security reporting channel or contact the maintainer directly. Include the Mindtrace version, Windows version, reproduction steps and a minimal project file if relevant.

## Not yet implemented

- Code signing / reproducible signed releases.
- Auto-update.
- Encryption at rest.
- Third-party license notices generation.
