#!/bin/bash
# Renders the press preview video from the current build of the game.
#
# The whole clip is deterministic: each scene seeds Math.random, warms the wave up
# by a fixed number of simulation steps, then steps two 60Hz ticks per captured
# frame. Same source file in, same video out.
#
# Everything happens inside ONE headless Chrome run — the game draws to its canvas,
# each frame is read back with toDataURL and collected in the DOM, and we decode
# the lot afterwards. Rendering one frame per Chrome launch was the obvious way to
# do it and was roughly a hundred times slower.
#
#   ./tools/make-preview.sh
set -e
cd "$(dirname "$0")/.."
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "Chrome not found at $CHROME"; exit 1; }
command -v ffmpeg >/dev/null || { echo "ffmpeg not installed (brew install ffmpeg)"; exit 1; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/frames" press

python3 - "$TMP" <<'PY'
import sys
tmp = sys.argv[1]
game = open('scrapline.html').read()
rec  = open('tools/preview-recorder.html').read()
open(tmp + '/rec.html', 'w').write(game.replace('</body>', rec + '</body>'))
PY

echo "rendering frames..."
"$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
  --window-size=900,600 --virtual-time-budget=180000 \
  --dump-dom "$TMP/rec.html" > "$TMP/dom.html" 2>/dev/null

python3 - "$TMP" <<'PY'
import base64, re, sys
tmp = sys.argv[1]
dom = open(tmp + '/dom.html', encoding='utf-8', errors='replace').read()
m = re.search(r'<pre id="FRAMES">(.*?)</pre>', dom, re.S)
if not m: raise SystemExit('no frames captured — check tools/preview-recorder.html')
frames = [f for f in m.group(1).strip().split('\n') if len(f) > 100]
if not frames: raise SystemExit('zero frames captured')
for i, f in enumerate(frames):
    open('%s/frames/f%04d.jpg' % (tmp, i), 'wb').write(base64.b64decode(f))
print('  %d frames' % len(frames))
PY

echo "encoding..."
ffmpeg -y -hide_banner -loglevel error -framerate 30 -i "$TMP/frames/f%04d.jpg" \
  -loop 1 -t 2 -i press/cover-16x9.png \
  -filter_complex "[0:v]scale=1080:720:flags=neighbor,pad=1280:720:(ow-iw)/2:0:color=#0A0706,fps=30,format=yuv420p[g];[1:v]scale=1280:720:flags=lanczos,fps=30,format=yuv420p[c];[g][c]concat=n=2:v=1:a=0[v]" \
  -map "[v]" -c:v libx264 -preset veryslow -crf 23 -movflags +faststart press/preview-16x9.mp4
ffmpeg -y -hide_banner -loglevel error -framerate 30 -i "$TMP/frames/f%04d.jpg" \
  -vf "scale=1350:900:flags=neighbor,fps=30,format=yuv420p" \
  -c:v libx264 -preset veryslow -crf 23 -movflags +faststart press/preview.mp4
ffmpeg -y -hide_banner -loglevel error -framerate 30 -i "$TMP/frames/f%04d.jpg" \
  -vf "scale=900:600:flags=neighbor,fps=30" -c:v libvpx-vp9 -b:v 0 -crf 38 -an press/preview.webm
echo "done:"; ls -lh press/preview* | awk '{print "  " $9, $5}'
