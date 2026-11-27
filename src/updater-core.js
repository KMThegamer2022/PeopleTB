// Update checking/downloading. Falls back to Electron's net module (so it can still be tested
// with plain node, where that fallback simply never triggers).
const https = require('https');
const fs = require('fs');

const UA = 'PeopleTB-Updater';

// Networks that HTTPS-inspect traffic (school/work filters like Fortinet) re-sign certificates
// with their own CA. Node's https trusts only its own bundled CA list, so it rejects that
// certificate even though Windows (and a real browser) trusts it. Electron's net module uses
// Chromium's network stack instead, which does consult the OS certificate store, so it succeeds
// the same way a browser would - we fall back to it when node's https hits one of these errors.
const CERT_CODES = new Set([
  'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_VERIFY_LEADING_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID'
]);
function isCertError(e) { return !!(e && CERT_CODES.has(e.code)); }

function nodeGet(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => resolve({ statusCode: res.statusCode, headers: res.headers, res }));
    req.setTimeout(20000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

// Only reachable inside Electron's main process, after app ready; required lazily so this file
// still loads (and the node transport above still works) when run standalone under plain node.
function electronGet(url, headers) {
  const { net } = require('electron');
  return new Promise((resolve, reject) => {
    const req = net.request({ method: 'GET', url });
    for (const [k, v] of Object.entries(headers)) req.setHeader(k, v);
    req.on('response', (res) => resolve({ statusCode: res.statusCode, headers: res.headers, res }));
    req.on('error', reject);
    req.end();
  });
}

function request(url, { follow = true, maxRedirects = 6, headers = {} } = {}) {
  const allHeaders = { 'User-Agent': UA, ...headers };
  return nodeGet(url, allHeaders)
    .catch((e) => { if (isCertError(e)) return electronGet(url, allHeaders); throw e; })
    .then((r) => {
      if (follow && [301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location && maxRedirects > 0) {
        r.res.resume();
        const next = new URL(r.headers.location, url).toString();
        return request(next, { follow, maxRedirects: maxRedirects - 1, headers });
      }
      return { status: r.statusCode, headers: r.headers, res: r.res };
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

module.exports = { latestRelease, download, cmp, isCertError };
