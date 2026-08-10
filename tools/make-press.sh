#!/bin/bash
# Regenerates the entire press kit — cover art in every aspect the portals ask for,
# gameplay screenshots, and landscape + portrait preview videos — from whatever the
# current build of the game is.
#
# Everything is deterministic: the trailer seeds its RNG per scene and advances a
# fixed number of ticks per frame, and the cover art is composed from frames of
# that same trailer, so the same source file always produces the same kit.
#
#   ./tools/make-press.sh
set -e
cd "$(dirname "$0")/.."
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "Chrome not found"; exit 1; }
command -v ffmpeg >/dev/null || { echo "ffmpeg not installed (brew install ffmpeg)"; exit 1; }
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/frames" press

echo "1/4  rendering gameplay frames"
python3 - "$TMP" <<'PY'
import sys
tmp = sys.argv[1]
open(tmp+'/rec.html','w').write(
  open('scrapline.html').read().replace('</body>', open('tools/preview-recorder.html').read()+'</body>'))
PY
"$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars --window-size=900,600 \
  --virtual-time-budget=180000 --dump-dom "$TMP/rec.html" > "$TMP/dom.html" 2>/dev/null
python3 - "$TMP" <<'PY'
import base64, re, sys
tmp = sys.argv[1]
m = re.search(r'<pre id="FRAMES">(.*?)</pre>',
              open(tmp+'/dom.html', encoding='utf-8', errors='replace').read(), re.S)
if not m: raise SystemExit('no frames captured')
fr = [f for f in m.group(1).strip().split('\n') if len(f) > 100]
if not fr: raise SystemExit('zero frames captured')
for i, f in enumerate(fr):
    open('%s/frames/f%04d.jpg' % (tmp, i), 'wb').write(base64.b64decode(f))
print('     %d frames' % len(fr))
PY

echo "2/4  screenshots + cover backgrounds"
# a dense late-wave frame drives all the key art
HERO="$TMP/frames/f0245.jpg"
ffmpeg -y -hide_banner -loglevel error -i "$TMP/frames/f0030.jpg" press/screenshot-2-swarm.png
ffmpeg -y -hide_banner -loglevel error -i "$TMP/frames/f0130.jpg" press/screenshot-1-boss.png
ffmpeg -y -hide_banner -loglevel error -i "$HERO"                 press/screenshot-3-late.png
ffmpeg -y -hide_banner -loglevel error -i "$HERO" -vf "crop=400:540:250:58,scale=800:1080:flags=neighbor" "$TMP/pbg.png"
ffmpeg -y -hide_banner -loglevel error -i "$HERO" -vf "crop=540:540:180:58,scale=800:800:flags=neighbor"  "$TMP/sbg.png"
cp "$HERO" "$TMP/lbg.jpg"
sed -e "s#__PBG__#$TMP/pbg.png#" -e "s#__SBG__#$TMP/sbg.png#" -e "s#__LBG__#$TMP/lbg.jpg#" \
    tools/press-cover.html > "$TMP/cover.html"

echo "3/4  cover art"
shot () { "$CHROME" --headless --disable-gpu --no-sandbox --allow-file-access-from-files \
  --hide-scrollbars --window-size=$2,$3 --virtual-time-budget=6000 \
  --screenshot="$4" "file://$TMP/cover.html#$1" 2>/dev/null; }
shot l 1920 1080 press/cover-16x9.png
shot p 800  1200 press/cover-2x3-800x1200.png
shot s 800  800  press/cover-1x1-800x800.png
shot v 1080 1620 "$TMP/pframe.png"
shot p 1080 1620 "$TMP/poutro.png"

echo "4/4  encoding video"
ffmpeg -y -hide_banner -loglevel error -framerate 30 -i "$TMP/frames/f%04d.jpg" \
  -loop 1 -t 2 -i press/cover-16x9.png \
  -filter_complex "[0:v]scale=1080:720:flags=neighbor,pad=1280:720:(ow-iw)/2:0:color=#0A0706,fps=30,format=yuv420p[g];[1:v]scale=1280:720:flags=lanczos,fps=30,format=yuv420p[c];[g][c]concat=n=2:v=1:a=0[v]" \
  -map "[v]" -c:v libx264 -preset veryslow -crf 23 -movflags +faststart press/preview-16x9.mp4
ffmpeg -y -hide_banner -loglevel error -framerate 30 -i "$TMP/frames/f%04d.jpg" \
  -vf "scale=1350:900:flags=neighbor,fps=30,format=yuv420p" \
  -c:v libx264 -preset veryslow -crf 23 -movflags +faststart press/preview.mp4
ffmpeg -y -hide_banner -loglevel error -framerate 30 -i "$TMP/frames/f%04d.jpg" \
  -vf "scale=900:600:flags=neighbor,fps=30" -c:v libvpx-vp9 -b:v 0 -crf 38 -an press/preview.webm
ffmpeg -y -hide_banner -loglevel error \
  -loop 1 -framerate 30 -i "$TMP/pframe.png" -framerate 30 -i "$TMP/frames/f%04d.jpg" \
  -loop 1 -t 2 -i "$TMP/poutro.png" \
  -filter_complex "[1:v]scale=1080:720:flags=neighbor,fps=30[g];[0:v]fps=30,trim=duration=9,setpts=PTS-STARTPTS[b];[b][g]overlay=0:(H-h)/2:shortest=1,format=yuv420p[body];[2:v]scale=1080:1620:flags=lanczos,fps=30,format=yuv420p[o];[body][o]concat=n=2:v=1:a=0[v]" \
  -map "[v]" -c:v libx264 -preset veryslow -crf 23 -movflags +faststart press/preview-portrait.mp4

echo; echo "press kit:"; ls -lh press/ | awk 'NR>1 {print "  " $9, $5}'
