// Update checking/downloading without any Electron dependency (so it can be tested with plain node).
const https = require('https');
const fs = require('fs');

const UA = 'PeopleTB-Updater';

function request(url, { follow = true, maxRedirects = 6, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA, ...headers } }, (res) => {
      if (follow && [301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && maxRedirects > 0) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        return resolve(request(next, { follow, maxRedirects: maxRedirects - 1, headers }));
      }
      resolve({ status: res.statusCode, headers: res.headers, res });
    });
    req.setTimeout(20000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
async function text(url, opts) {
  const r = await request(url, opts);
  const chunks = [];
  for await (const c of r.res) chunks.push(c);
  return { status: r.status, headers: r.headers, body: Buffer.concat(chunks).toString('utf8') };
}

function cmp(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number);
  const pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d < 0 ? -1 : 1; }
  return 0;
}

// 1) GitHub REST API.  2) If that is rate limited / fails: follow the github.com "latest release" redirect,
// which is not subject to the API rate limit, and build the installer URL from the tag.
async function latestRelease(repo, artifact /* (version) => file name */, { skipApi = false } = {}) {
  try {
    if (skipApi) throw new Error('skipped');
    const r = await text(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (r.status === 200) {
      const j = JSON.parse(r.body);
      const asset = (j.assets || []).find((a) => /\.exe$/i.test(a.name));
      if (j.tag_name && asset) return { version: j.tag_name.replace(/^v/, ''), url: asset.browser_download_url, source: 'api' };
    }
    // 403 / 429 (rate limited), 404, odd payload -> fall through
  } catch { /* network/API problem -> fall through */ }

  const r = await request(`https://github.com/${repo}/releases/latest`, { follow: false });
  r.res.resume();
  const loc = r.headers.location || '';
  const m = loc.match(/\/releases\/tag\/(v?[\d.]+)$/);
  if (!m) throw new Error('Could not determine latest release');
  const tag = m[1], version = tag.replace(/^v/, '');
  return { version, url: `https://github.com/${repo}/releases/download/${tag}/${artifact(version)}`, source: 'redirect' };
}

async function download(url, dest, onProgress) {
  const r = await request(url);
  if (r.status !== 200) { r.res.resume(); throw new Error('Download failed (HTTP ' + r.status + ')'); }
  const total = Number(r.headers['content-length']) || 0;
  let got = 0;
  const tmp = dest + '.part';
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tmp);
    r.res.on('data', (c) => { got += c.length; if (onProgress && total) onProgress(got / total); });
    r.res.on('error', reject); out.on('error', reject); out.on('finish', resolve);
    r.res.pipe(out);
  });
  if (total && got !== total) throw new Error('Incomplete download');
  fs.renameSync(tmp, dest);
  return dest;
}

module.exports = { latestRelease, download, cmp };
