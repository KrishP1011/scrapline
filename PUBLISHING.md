# Publishing Scrapline

Everything here is built from one source file, `scrapline.html`. The whole game is
a single self-contained HTML file, so an upload is usually just that one file —
no archive, no asset folder. Nothing in `dist/` is ever hand-edited; regenerate
it with:

```
node tools/build-portals.js
```

| build | what it is | ads |
|---|---|---|
| `dist/crazygames/` | CrazyGames SDK injected | portal's own, around the iframe |
| `dist/poki/` | Poki SDK injected | portal's own, around the iframe |
| `dist/selfhost/` | no portal SDK, own ad rails enabled | yours, in the side rails |
| `scrapline.html` | plain build, no ads at all | none |

## Saving progress

CrazyGames runs submitted games in an iframe, where their Automatic Progress Save
does not apply and third-party localStorage can be partitioned or blocked. The
game therefore uses **the CrazyGames SDK data module** when it is present, and
plain localStorage everywhere else — same key, `scrapline.meta.v2`.

Answer their form with **"Yes, using the Data Module from the CrazyGames SDK"**.

Writes go to both stores. The local copy keeps the game playable if the portal
store ever fails, and it means progress made on the plain build is picked up the
first time someone plays the portal build. Because their SDK initialises
asynchronously, the game re-reads storage once the data module exists, so cloud
progress wins over whatever was loaded at boot.

## Why the game carries no ad code

CrazyGames and Poki both prohibit third-party ad code inside a submitted game.
They run your game in an iframe on their page and sell the surrounding banners
themselves. So on a portal you place no ads at all — you only make the SDK calls
they require, and the "ads outside the game" happen automatically on their page.

`tools/build-portals.js` refuses to produce a build that breaks this: it fails if
a portal build contains our own ad units, if a build carries two SDKs, or if any
third-party ad script appears anywhere.

## Where ads are allowed to appear

Encoded in the `Ads` object in `scrapline.html`:

- **Never during a run.** `gameplayStart()` / `gameplayStop()` bracket live play,
  and portals use that to know when not to interrupt.
- **Interstitial only between runs**, on the death screen, ~1 second after the
  summary appears so the result is read first. Rate limited to one per
  `Ads.MIN_GAP` seconds (150). Set `Ads.INTERSTITIAL_ON_DEATH = false` to remove
  it entirely — you will earn far less, but nothing else breaks.
- **Rewarded only when the player asks**, via the opt-in button on the summary
  that doubles the run's tokens. The tokens are banked *before* the button shows,
  so declining costs nothing.
- Audio is muted for the duration of any ad and restored afterwards.

## Submitting to CrazyGames

1. `node tools/build-portals.js`
2. Create a developer account at developer.crazygames.com and start a new game.
3. **Drag `dist/crazygames/index.html` directly into their upload zone.** Their
   uploader rejects archives — "Archive files are not supported, please drag and
   drop the files directly in the upload zone" — and because the whole game is one
   self-contained file, that single file *is* the upload. Do not drag the folder,
   and do not use the zip.
4. Fill in: title, description, controls, tags, and a thumbnail. Take screenshots
   from the game itself — a boss fight reads best.
5. They test on desktop and mobile. Known-good already: instant load, no external
   requests, touch controls, pause on focus loss.

## Submitting to Poki

1. `node tools/build-portals.js`
2. Upload `dist/poki/index.html`. A zip of that folder's *contents* is also built
   at `dist/scrapline-poki.zip` if their form asks for an archive instead — check
   which their uploader wants, since CrazyGames rejects archives outright.
3. Apply at developers.poki.com. Poki is more selective and reviews playtest data
   before a wide release, so submit after CrazyGames has been live a while.
4. Poki checks the SDK integration specifically: `gameplayStart`/`gameplayStop`
   around real play, `gameLoadingFinished` once, and a `commercialBreak` between
   sessions. All three are wired.

Both portals are non-exclusive by default — read the current agreement, but you
can normally run on both at once.

## Self-hosting with your own ads

Only worth doing once you have traffic of your own.

1. **Move off GitHub Pages.** Its terms prohibit commercial use. Netlify,
   Vercel and Cloudflare Pages all have free tiers that allow it.
2. Deploy `dist/selfhost/index.html` as your `index.html`.
3. Get a real domain — ad networks reject `*.github.io` and similar.
4. Add a privacy policy and a consent banner. Legally required in the EU/UK and
   demanded by every ad network.
5. Paste your ad unit code into `#adLeft`, `#adRight` and `#adBottom`. They sit
   outside the game in normal document flow, so an ad can never overlap or resize
   the canvas — verified: the canvas is 900x602 with rails on and with them off.
6. Start with AdSense; move to a game-specialised network (AdinPlay, Venatus,
   Playwire) once you meet their traffic minimums.

## Honest expectations

Ad revenue is traffic times RPM, and a new game has no traffic. Self-hosted ads
on a game nobody has found yet earn approximately nothing, and ad blockers remove
a large share of web-game traffic on top of that. The realistic path is the
portals: they already have the audience, and their revenue share on real traffic
is worth more than 100% of nothing.
