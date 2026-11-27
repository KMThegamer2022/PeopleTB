const { app, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const core = require('./updater-core');

const REPO = 'KMThegamer2022/PeopleTB';
const artifact = (v) => `PeopleTB-Setup-${v}.exe`;
let busy = false;

// Networks that HTTPS-inspect traffic (school/work filters like Fortinet) re-sign certificates
// with their own CA; Node trusts only its own bundled list, so this looks like a bad cert to us
// even though Windows (and the browser) trusts it. Not a problem with PeopleTB or GitHub.
const CERT_CODES = new Set([
  'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_VERIFY_LEADING_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID'
]);
function describeError(e) {
  if (e && CERT_CODES.has(e.code)) {
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
