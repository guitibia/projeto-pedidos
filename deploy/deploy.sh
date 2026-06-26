#!/usr/bin/env bash
# Atualiza a loja no servidor. Rode de qualquer lugar: bash deploy/deploy.sh
set -e
cd "$(dirname "$0")/.."
echo "→ git pull origin main"
git pull origin main
echo "→ npm ci --omit=dev"
npm ci --omit=dev
echo "→ pm2 restart beleza-loja"
pm2 restart beleza-loja
echo "✅ Deploy concluído."
