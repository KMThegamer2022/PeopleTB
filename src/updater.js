const { app, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const core = require('./updater-core');

const REPO = 'KMThegamer2022/PeopleTB';
const artifact = (v) => `PeopleTB-Setup-${v}.exe`;
let busy = false;

// updater-core already retries certificate errors over Electron's net module (which consults the
// OS certificate store, like a browser), so reaching here means that fallback also failed - still
// worth telling the user it's their network, not PeopleTB or GitHub.
function describeError(e) {
  if (core.isCertError(e)) {
    return 'This network appears to be intercepting HTTPS connections (common on school/work Wi-Fi, '
      + 'e.g. Fortinet filtering) and PeopleTB doesn\'t trust its certificate. Try again on a different '
      + 'network, or ask network admin/IT about it. (' + e.code + ')';
  }
  return (e && e.message) ? e.message : String(e);
}

async function check({ manual = false, onQuit, onBusy } = {}) {
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
    if (onBusy) onBusy(true);
    try { await core.download(latest.url, dest); } finally { if (onBusy) onBusy(false); }
    // Silent per-user install; --force-run relaunches the app when it has finished.
    spawn(dest, ['/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
    (onQuit || (() => app.quit()))();
  } catch (e) {
    if (manual) dialog.showErrorBox('PeopleTB update', 'Could not check for updates.\n' + describeError(e));
  } finally { busy = false; }
}

function start(opts) {
  setTimeout(() => check(opts), 6000);                 // on startup
  setInterval(() => check(opts), 6 * 60 * 60 * 1000);   // and every 6 hours
}
module.exports = { check, start };
