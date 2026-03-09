# Game Manifest Reference

Manifests live in `data/manifests/*.json`.

Required fields:
- `id`, `title`, `version`
- `install_dir_name`
- `assets[]` (file_name + url)
- `archive_type` (`zip` or `7z`)
- `executable_relative_path`

## Multipart 7z
Set:
- `archive_type: "7z"`
- `multipart: true`
- assets ordered as `.001`, `.002`, ...

The launcher verifies asset naming pattern and extracts from first part.

## Update model
`version` in manifest is compared with `data/state.json` installed version.
If different, UI shows **Update**.

## Preserve paths on uninstall
`preserve_paths_on_uninstall` supports folder names under install directory to retain (e.g. `Saves`).
