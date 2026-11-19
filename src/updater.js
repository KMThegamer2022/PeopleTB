const { app, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const core = require('./updater-core');

const REPO = 'KMThegamer2022/PeopleTB';
const artifact = (v) => `PeopleTB-Setup-${v}.exe`;
let busy = false;

async function check({ manual = false, onQuit } = {}) {
  if (busy) return;
  if (!app.isPackaged && !manual) return; // don't self-update dev runs
  busy = true;
  try {
    const latest = await core.latestRelease(REPO, artifact);
    const current = app.getVersion();
    if (core.cmp(current, latest.version) >= 0) {
      if (manual) await dialog.showMessageBox({ type: 'info', title: 'PeopleTB', message: 'You are up to date.', detail: `Version ${current}` });
      return;
    }
    const { response } = await dialog.showMessageBox({
      type: 'question', title: 'PeopleTB update', buttons: ['Update now', 'Later'], defaultId: 0, cancelId: 1,
      message: `PeopleTB ${latest.version} is available.`,
      detail: `You have ${current}. PeopleTB will download the update, install it and restart.`
    });
    if (response !== 0) return;
    const dest = path.join(os.tmpdir(), artifact(latest.version));
    await core.download(latest.url, dest);
    // Silent per-user install; --force-run relaunches the app when it has finished.
    spawn(dest, ['/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
    (onQuit || (() => app.quit()))();
  } catch (e) {
    if (manual) dialog.showErrorBox('PeopleTB update', 'Could not check for updates.\n' + (e && e.message ? e.message : e));
  } finally { busy = false; }
}

function start(opts) {
  setTimeout(() => check(opts), 6000);                 // on startup
  setInterval(() => check(opts), 6 * 60 * 60 * 1000);   // and every 6 hours
}
module.exports = { check, start };
