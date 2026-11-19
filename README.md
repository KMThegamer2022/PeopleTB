# PeopleTB

Tiny desktop pals (Jack, James, Oscar…) that cling onto the top of your Windows taskbar.

- Tray icon / right-click Jack → **Settings**, **Show/Hide**, **Start with Windows**, **Quit**
- Settings: size, position along the taskbar, start at startup
- Click Jack to make him hop

## Install
Grab `PeopleTB-Setup-x.y.z.exe` from the [Releases](../../releases) page (or the latest Actions run artifact).

## Develop
```
npm install
npm start          # run
npm run dist       # build installer into dist/ (on Windows)
```
Pushing to `main` builds the installer via GitHub Actions; pushing a `v*` tag publishes a Release.

## Compatibility
Built on Electron 22, the last version that supports Windows 7 / 8 / 8.1 (as well as 10 / 11).
Windows 7 needs SP1 and Aero (desktop composition) enabled for Jack's transparent window.

## Characters / skins
Characters live in `assets/characters/`. To add one: drop a head-and-shoulders PNG (transparent background) in a new
folder, add an entry to `assets/characters/characters.json` (several `skins` per character are supported), and it shows up
in the right-click **Character** menu. `tools/cutout.swift` (macOS) removes backgrounds and `tools/make_head.py` crops the sprite.
All characters share Jack's hands.

## Auto-update
On startup (and every 6 h) PeopleTB asks the GitHub API for the latest release. If the API is rate limited it falls back to the
`github.com/.../releases/latest` redirect, then offers to download and silently install the new installer.
