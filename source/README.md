# PortableGitHubGameLauncher

PortableGitHubGameLauncher is a **closed-catalog Windows launcher** for legally distributable games.

## Important legal notice
This launcher must only be used for games you own, created, or are explicitly authorized to redistribute. Do not use this software for piracy, DRM bypass, or unauthorized distribution of paid content.

## Portable folder layout
When packaged, the launcher folder is portable and can be moved to another path/USB drive:

- `PortableGitHubGameLauncher.exe`
- `data/manifests/` (catalog controlled by local files only)
- `data/cache/`
- `data/logs/`
- `data/images/`
- `data/schema/`
- `games/`
- `temp/`
- `docs/`
- `source/`

## Closed catalog behavior
- End users **cannot add/edit/import** games from UI.
- Catalog is loaded only from `data/manifests/*.json`.
- Do not expose arbitrary GitHub URL input in app settings.

## Usage for non-technical operators
1. Open `data/manifests/` and duplicate one sample manifest.
2. Fill metadata and GitHub release asset URLs for your legally distributable game.
3. Save JSON and restart launcher.
4. Game appears in Home automatically.

## Features implemented
- Home, Installed Library, Downloads Queue, Settings/About views.
- Search by title/tags/genre/developer.
- Install / Update / Repair / Launch / Uninstall flows.
- GitHub release downloading with progress, retries and timeout.
- ZIP + 7Z extraction, including multipart `.7z.001/.002` sequence.
- Persistent portable state in `data/state.json`.
- Logs in `data/logs/launcher.log`.
- Offline startup with installed metadata retained.

## Build and package done by agent
```bash
npm install
npm run build:win
```
Generated package appears under `release/PortableGitHubGameLauncher-win32-x64`.

## Manifest schema docs
See `docs/MANIFEST.md` and `data/schema/game-manifest.schema.json`.
