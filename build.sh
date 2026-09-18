#!/usr/bin/env bash
# Wraps the artifact body (src/roadmap-studio.html) into a standalone
# document you can open straight from disk: index.html.
#
# The Artifact platform supplies the doctype/head/reset at publish time, so
# the source file carries only the page body. This script adds the same
# skeleton so both copies behave identically.

set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
src="$here/src/roadmap-studio.html"
out="$here/index.html"

{
  cat <<'HEAD'
<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>
  :root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
  body{margin:0;font:14px system-ui,sans-serif;background:#faf9f7}
  img{max-width:100%}
  [hidden]{display:none!important}
</style>
HEAD
  cat "$src"
  cat <<'FOOT'
</body>
</html>
FOOT
} > "$out"

# The body opens right after the <style>/<link> block the source starts with.
# Insert the <body> tag just before the first top-level <div class="app">.
python3 - "$out" <<'PY'
import sys, re
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
s = s.replace('<div class="app">', '</head>\n<body>\n<div class="app">', 1)
open(p, "w", encoding="utf-8").write(s)
PY

echo "built $out ($(wc -c < "$out") bytes)"
