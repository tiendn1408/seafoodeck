#!/bin/sh
set -eu
umask 077
backup_dir=${1:?Usage: sh scripts/backup-pilot.sh _backups/release-backup}
case "$backup_dir" in _backups/*) ;; *) echo 'Use a new directory under _backups/.' >&2; exit 2;; esac
test ! -e "$backup_dir"
mkdir -p "$backup_dir"
compose() { docker compose --env-file .local/pilot.env --project-directory . -f "${PILOT_COMPOSE_FILE:-compose.yaml}" "$@"; }
compose stop api
trap 'compose start api >/dev/null' EXIT HUP INT TERM
compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl' > "$backup_dir/db.sql"
compose run --rm --no-deps --user 0 -v "$(pwd)/$backup_dir:/backup" -e BACKUP_DIR=/backup api node dist/objects.js backup
compose config --images > "$backup_dir/images.txt"
echo "Backup saved privately to $backup_dir. No archive or credentials were published."
