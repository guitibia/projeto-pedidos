#!/usr/bin/env bash
# Backup diário do banco da loja (produção).
# Usa ~/.my.cnf para as credenciais — nenhuma senha fica na linha de comando/histórico.
# Gera um dump comprimido, valida, roda rotação local e (opcional) envia p/ nuvem via rclone.
set -euo pipefail

DB="db_pedidos"
DIR="$HOME/backups"
KEEP_DAYS=14                       # mantém os últimos 14 dias no VPS
CNF="$HOME/.my.cnf"
RCLONE_REMOTE=""                   # ex.: "gdrive:backups-beleza" p/ enviar ao Google Drive; vazio = só local
RCLONE_KEEP_DAYS=60                # dias que mantém no destino remoto (nuvem)

mkdir -p "$DIR"
STAMP="$(date +%F_%H%M)"
FILE="$DIR/db_pedidos_${STAMP}.sql.gz"
LOG="$DIR/backup.log"

# Dump consistente (InnoDB) + rotinas/triggers/events, comprimido com gzip.
if mysqldump --defaults-file="$CNF" --single-transaction --quick --no-tablespaces \
     --routines --triggers --events "$DB" | gzip > "$FILE" && [ -s "$FILE" ]; then
  echo "$(date '+%F %T') OK    $FILE ($(du -h "$FILE" | cut -f1))" >> "$LOG"
else
  echo "$(date '+%F %T') FALHA no mysqldump" >> "$LOG"
  rm -f "$FILE"
  exit 1
fi

# Rotação local: remove dumps com mais de KEEP_DAYS dias.
find "$DIR" -name 'db_pedidos_*.sql.gz' -mtime +"$KEEP_DAYS" -delete

# Cópia fora do servidor (opcional): envia p/ a nuvem se RCLONE_REMOTE estiver definido e o rclone existir.
if [ -n "$RCLONE_REMOTE" ] && command -v rclone >/dev/null 2>&1; then
  if rclone copy "$FILE" "$RCLONE_REMOTE" >> "$DIR/rclone.log" 2>&1; then
    echo "$(date '+%F %T') OK    enviado p/ $RCLONE_REMOTE" >> "$LOG"
    rclone delete "$RCLONE_REMOTE" --min-age "${RCLONE_KEEP_DAYS}d" >> "$DIR/rclone.log" 2>&1 || true
  else
    echo "$(date '+%F %T') AVISO falha ao enviar p/ $RCLONE_REMOTE (backup local OK)" >> "$LOG"
  fi
fi
