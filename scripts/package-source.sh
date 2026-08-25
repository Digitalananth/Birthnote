#!/usr/bin/env bash
# Builds the SOURCE zip for manual upload to a Hostinger Web App.
#
# Hostinger builds on the server: it runs `npm install --omit=dev`, then
# `npm run build`, then `npm start`. So this zip must contain the source tree,
# NOT a compiled bundle. Uploading `.next`/`server.js` instead fails with
# "Couldn't find any `pages` or `app` directory".
#
# Contents = exactly the files git tracks. That deliberately excludes .env,
# node_modules and .next; configuration comes from the Web App's environment
# panel, and dependencies/build are produced on the server.
set -euo pipefail
cd "$(dirname "$0")/.."

ZIP=birthnote-source.zip
rm -f "$ZIP"

git ls-files -z | xargs -0 zip -qr "$ZIP"

echo "$ZIP  ($(du -h "$ZIP" | cut -f1), $(unzip -l "$ZIP" | tail -1 | awk '{print $2}') files)"
echo
echo "Sanity check — these must be present, and .env must not be:"
unzip -l "$ZIP" | grep -E 'src/app/page.tsx|src/app/api/requests/route.ts|package.json|package-lock.json|next.config.mjs' || true
unzip -l "$ZIP" | grep -E '(^|/)\.env|node_modules|\.next/' && echo "!! BAD: build/secret files leaked into the zip" && exit 1
echo "clean."
