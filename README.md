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
