// Builds submittable packages for each portal from the single source file.
//
// The game itself never bundles a portal SDK: CrazyGames and Poki each forbid
// shipping the other's, and a self-hosted copy should ship neither. So the SDK
// <script> is injected here at build time instead, and the game's Ads layer
// detects whichever one is present at runtime. scrapline.html stays the one
// source of truth — nothing is ever hand-edited in dist/.
//
//   node tools/build-portals.js
//
// Output:
//   dist/crazygames/index.html   — CrazyGames SDK
//   dist/poki/index.html         — Poki SDK
//   dist/selfhost/index.html     — no SDK, own ad rails enabled
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'scrapline.html'), 'utf8');

// Both portals load their SDK from their own CDN and require it to be present
// before the game script runs, so it goes in <head>.
const TARGETS = {
  crazygames: {
    head: '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>',
    note: 'CrazyGames SDK v3'
  },
  poki: {
    head: '<script src="https://game-cdn.poki.com/scripts/v2/poki-sdk.js"></script>',
    note: 'Poki SDK v2'
  },
  selfhost: {
    // no portal SDK; this is the only build allowed to run our own ad units
    head: '<script>window.SCRAPLINE_ADS = true;</script>',
    note: 'self-hosted — own ad rails enabled'
  }
};

function build(name, cfg) {
  if (!src.includes('</head>')) throw new Error('no </head> in source');
  const out = src.replace('</head>',
    '\n<!-- injected by tools/build-portals.js: ' + cfg.note + ' -->\n' + cfg.head + '\n</head>');
  const dir = path.join(root, 'dist', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), out);
  return { name: name, bytes: Buffer.byteLength(out), dir: path.relative(root, dir) };
}

// A portal build that still contains our own ad code would be rejected, and a
// build carrying two SDKs would break both. Check rather than trust.
function verify(name, file) {
  const html = fs.readFileSync(file, 'utf8');
  const problems = [];
  const sdks = ['crazygames-sdk', 'poki-sdk'].filter(x => html.includes(x));
  if (name !== 'selfhost' && sdks.length !== 1) problems.push('expected exactly one SDK, found ' + sdks.length);
  if (name === 'selfhost' && sdks.length !== 0) problems.push('self-host build must carry no portal SDK');
  // match the ASSIGNMENT, not the game's own read of the flag — the runtime check
  // `if (window.SCRAPLINE_ADS)` lives in every build by design
  if (name !== 'selfhost' && /window\.SCRAPLINE_ADS\s*=/.test(html)) problems.push('own ad units enabled on a portal build');
  if (/adsbygoogle|googlesyndication|doubleclick/i.test(html)) problems.push('third-party ad code present');
  if (!html.includes('Ads.gameplayStart')) problems.push('gameplay lifecycle calls missing');
  return problems;
}

let failed = false;
for (const [name, cfg] of Object.entries(TARGETS)) {
  const r = build(name, cfg);
  const problems = verify(name, path.join(root, 'dist', name, 'index.html'));
  const kb = (r.bytes / 1024).toFixed(0);
  if (problems.length) { failed = true; console.log('FAIL  ' + name + '  ' + problems.join('; ')); }
  else console.log('ok    ' + r.dir + '/index.html  (' + kb + ' KB)  ' + cfg.note);
}
// zip each portal build with index.html at the archive root, which is the layout
// both portals require — a nested folder is the most common rejection
if (!failed) {
  const { execSync } = require('child_process');
  for (const name of ['crazygames', 'poki']) {
    const zip = path.join(root, 'dist', 'scrapline-' + name + '.zip');
    try {
      fs.existsSync(zip) && fs.unlinkSync(zip);
      execSync('zip -q -r ' + JSON.stringify(zip) + " . -x '.*'", { cwd: path.join(root, 'dist', name) });
      console.log('zip   dist/scrapline-' + name + '.zip  (' + (fs.statSync(zip).size / 1024).toFixed(0) + ' KB)');
    } catch (e) { console.log('zip   skipped for ' + name + ' (' + e.message + ')'); }
  }
}
console.log(failed ? '\nbuild FAILED' : '\nAll builds clean.');
process.exit(failed ? 1 : 0);
