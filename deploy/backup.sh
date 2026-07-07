#!/usr/bin/env bash
# Backup diário do banco da loja (produção).
# Usa ~/.my.cnf para as credenciais — nenhuma senha fica na linha de comando/histórico.
# Gera um dump comprimido, valida, e apaga backups antigos (rotação).
set -euo pipefail

DB="db_pedidos"
DIR="$HOME/backups"
KEEP_DAYS=14                      # mantém os últimos 14 dias
CNF="$HOME/.my.cnf"

mkdir -p "$DIR"
STAMP="$(date +%F_%H%M)"
FILE="$DIR/db_pedidos_${STAMP}.sql.gz"
LOG="$DIR/backup.log"

# Dump consistente (InnoDB) + rotinas/triggers/events, comprimido com gzip.
if mysqldump --defaults-file="$CNF" --single-transaction --quick \
     --routines --triggers --events "$DB" | gzip > "$FILE"; then
  # valida que o arquivo não ficou vazio
  if [ -s "$FILE" ]; then
    echo "$(date '+%F %T') OK    $FILE ($(du -h "$FILE" | cut -f1))" >> "$LOG"
  else
    echo "$(date '+%F %T') FALHA arquivo vazio: $FILE" >> "$LOG"
    rm -f "$FILE"
    exit 1
  fi
else
  echo "$(date '+%F %T') FALHA mysqldump retornou erro" >> "$LOG"
  rm -f "$FILE"
  exit 1
fi

# Rotação: remove dumps com mais de KEEP_DAYS dias.
find "$DIR" -name 'db_pedidos_*.sql.gz' -mtime +"$KEEP_DAYS" -delete
