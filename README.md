# Taskbar Jack

A tiny desktop pet: Jack clings onto the top of your Windows taskbar.

- Tray icon / right-click Jack → **Settings**, **Show/Hide**, **Start with Windows**, **Quit**
- Settings: size, position along the taskbar, start at startup
- Click Jack to make him hop

## Install
Grab `Taskbar-Jack-Setup-x.y.z.exe` from the [Releases](../../releases) page (or the latest Actions run artifact).

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
