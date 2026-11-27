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
Characters: Jack, James, Oscar, Lewis, Arrow, Harrison, Jayden, Reuben. They live in `assets/characters/`. To add one: drop a head-and-shoulders PNG (transparent background) in a new
folder, add an entry to `assets/characters/characters.json` (several `skins` per character are supported), and it shows up
in the right-click **Characters → Add…** menu. `tools/cutout.swift` (macOS) removes backgrounds and `tools/make_head.py` crops the sprite.
All characters share Jack's hands.

You can have several characters on the taskbar at once: **Characters → Add…** adds another instance, and **Characters → Remove**
takes one off. Each instance is dragged and resized independently; the Settings window has a tab per character (with a **+ Add**
tab and a **✕** on each one to remove it) to edit each one's character, size, hand size and position.

## Auto-update
On startup (and every 6 h) PeopleTB asks the GitHub API for the latest release. If the API is rate limited it falls back to the
`github.com/.../releases/latest` redirect, then offers to download and silently install the new installer.


## If the character is very slow to appear (older PCs / Windows 7)
Two things in v1.3.6+ target this:
- Hardware acceleration is disabled, since a weak/old GPU can make Chromium's GPU process crash-loop and
  leave a transparent window blank for minutes before it falls back to software rendering.
- The "hide in fullscreen apps" watcher (which spawns PowerShell to compile a tiny bit of C#) now only
  starts a few seconds after the character is already shown, and only if that setting is on - turn off
  "Hide in fullscreen apps" in Settings to skip it entirely if PowerShell is slow on your PC.
