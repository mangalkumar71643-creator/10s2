#!/bin/sh
# ApnaPay - run with: sh start-mac-linux.sh   (needs Node.js 22.13+)
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Node.js nahi mila. https://nodejs.org se Node.js 22 install karein."; exit 1; }
[ -d node_modules ] || npm install --omit=dev
echo "Admin panel: http://localhost:3000/admin"
npm start
