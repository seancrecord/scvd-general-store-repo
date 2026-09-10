#!/bin/sh
# Screenshots every src/*.html to png/*.png at 2x with the bundled Chromium.
# Run build.mjs first. No Playwright module needed; the binary is enough.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
CHROME=${CHROME:-/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell}
mkdir -p "$HERE/png"
for f in "$HERE"/src/*.html; do
  name=$(basename "$f" .html)
  "$CHROME" --headless --no-sandbox --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=2 --window-size=1600,900 \
    --screenshot="$HERE/png/$name.png" "file://$f" >/dev/null 2>&1
  echo "$name.png"
done
