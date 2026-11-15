# Desktop beta candidate

This candidate combines the licence-free local editor, separate settings
converter handoff, portable project files, and physical SVG placement fixes.
The earlier review branches remain open; nothing is merged or publicly released.

The Windows workflow builds an **Engraving Prep Tool Beta** installer with a
separate application identity, package name and shortcut. Its Electron profile
is separate from the production app. Do not copy over or delete your production
profile. Keep portable project backups before testing.

## Getting the test build

Open the successful **Desktop beta candidate** GitHub Actions run for the
`release/desktop-beta` branch. Download its artifact and extract it. It contains
the beta installer, SHA256 checksum and installer report. Artifacts expire after
14 days and inherit repository visibility; no credentials or customer projects
belong in them. No GitHub release, updater or website is published by this job.

Code signing is not configured. Treat the installer as an unsigned test build,
not a finished public distribution. The report records its actual signature state.

## Windows acceptance checklist

- Install the beta and confirm its Beta shortcut is separate from the existing app.
- Import a PNG and an editable SVG. Set a known material size, position the art,
  add cut/score/engrave shapes and save an `.engraving-project.json` file.
- Close with unsaved edits: **Stay and save** must keep the app open; only an
  intentional **Leave without saving** should discard changes.
- Close the app, restart Windows, open the beta and reopen the saved project.
  Check artwork, material dimensions, position, modes and masks.
- Cancel replacing unsaved work, and try an invalid project file. Neither should
  change the current project.
- Export SVG, PNG/JPEG and PDF. Confirm physical dimensions in xTool Studio.
  For SVG, export/re-import must not enlarge or recenter positioned artwork.
- Transfer existing saved converter presets to the separate Settings Converter.
- Repeat with one real project and retain the original as an untouched backup.

The workflow checks tests, build, silent installation and installed product
identity. It does **not** certify the installed app's editing/restart workflow.
Record those manual results before approving a release.

## Release boundaries

Local preparation and exports are in scope. Account/cloud and paid AI services
have not been release-certified. Mobile optimization and repeatable titanium
color recipes are deferred. Decide commercial licensing before a paid launch.
The existing stable updater and public download links stay untouched until a
tested, approved release is available.
