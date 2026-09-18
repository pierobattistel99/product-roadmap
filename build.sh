#!/usr/bin/env bash
# Wraps the artifact body (src/roadmap-studio.html) into a standalone
# document you can open straight from disk, and that Vercel serves as-is:
# index.html.
#
# The Artifact platform supplies the doctype/head/reset at publish time, so
# the source file carries only the page body. This adds the same skeleton.
# Pure bash + awk on purpose: it has to run in any CI image.

set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
src="$here/src/roadmap-studio.html"
out="$here/index.html"

[ -f "$src" ] || { echo "missing $src" >&2; exit 1; }

cat > "$out" <<'HEAD'
<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Costruisce le due slide di roadmap del quarter — vista stakeholder e vista design — dipingendo le fasi sulla griglia degli sprint.">
<meta name="color-scheme" content="light dark">
<style>
  :root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
  body{margin:0;font:14px system-ui,sans-serif;background:#faf9f7}
  img{max-width:100%}
  [hidden]{display:none!important}
</style>
HEAD

# The body starts at the first top-level <div class="app">: close the head and
# open the body right before it.
awk '
  !opened && /^<div class="app">/ { print "</head>"; print "<body>"; opened = 1 }
  { print }
  END { if (!opened) { print "awk: body marker not found" > "/dev/stderr"; exit 1 } }
' "$src" >> "$out"

printf '</body>\n</html>\n' >> "$out"

echo "built $out ($(wc -c < "$out" | tr -d ' ') bytes)"
