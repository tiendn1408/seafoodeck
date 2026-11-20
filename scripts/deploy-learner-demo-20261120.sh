#!/bin/sh
# Run from the repo root on the existing demo VPS. No seed, reset, volume deletion or other project.
set -eu
umask 077
mode=${1:---check}
case "$mode" in --check|--apply) ;; *) echo 'Usage: sh scripts/deploy-learner-demo-20261120.sh --check|--apply' >&2; exit 2;; esac
api_ref=ghcr.io/tiendn1408/seafoodeck-api@sha256:aea7ab9d00ad115aa621db45a7f7ca459e096d325b91cfd403c372b1356f56e0
web_ref=ghcr.io/tiendn1408/seafoodeck-web@sha256:16597286ae414f4b408d958642c3bbda45015c8cf40cc87d8ceb0361ec344bf9
release=learner-demo-20261120-r1
compose_file=deploy/compose.pilot.ghcr.yaml
test -f .local/pilot.env && test -f .local/s3.json && test -f "$compose_file"
dc() { docker compose --env-file .local/pilot.env --project-directory . -f "$compose_file" "$@"; }
api_id=$(dc ps -q api)
web_id=$(dc ps -q web)
test -n "$api_id" && test -n "$web_id"
test "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$api_id")" = "$PWD"
# Do not print conflicting usernames or any credentials.
duplicates=$(dc exec -T db sh -c 'psql -X -qAt -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' <<'SQL'
SELECT count(*) FROM (SELECT lower("username") FROM "User" GROUP BY lower("username") HAVING count(*) > 1) AS conflicts;
SQL
)
if [ "$duplicates" != 0 ]; then echo 'Username case collisions: resolve before migration. No service changed.' >&2; exit 1; fi
test "$(grep -c '^API_IMAGE_REF=' .local/pilot.env)" = 1
test "$(grep -c '^WEB_IMAGE_REF=' .local/pilot.env)" = 1
docker pull "$api_ref"
docker pull "$web_ref"
echo 'Preflight passed; target images available. No database changes yet.'
[ "$mode" = --apply ] || exit 0
backup_dir=".local/deploy-backups/before-learner-$(date -u +%Y%m%dT%H%M%SZ)"
test ! -e "$backup_dir"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
cp .local/pilot.env "$backup_dir/pilot.env"
cp .local/s3.json "$backup_dir/s3.json"
cp "$compose_file" "$backup_dir/compose.pilot.ghcr.yaml"
dc config --images > "$backup_dir/images.txt"
printf '%s\n' "$backup_dir" > .local/latest-learner-backup.txt
metadata() {
 dc exec -T db sh -c 'psql -X -qAt -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' <<'SQL'
SELECT json_build_object('items',(SELECT count(*) FROM "Item"),'media',(SELECT count(*) FROM "MediaAsset"),'revisions',(SELECT count(*) FROM "Revision"),'internalRelease',(SELECT value FROM "Setting" WHERE id='current:internal'),'publicRelease',(SELECT value FROM "Setting" WHERE id='current:public'));
SQL
}
finished=false
stopped=false
recover() {
 code=$?
 trap - EXIT HUP INT TERM
 if [ "$finished" = false ] && [ "$stopped" = true ]; then
  echo 'Upgrade incomplete; restoring previous application images. Additive schema and backup retained.' >&2
  cp "$backup_dir/pilot.env" .local/pilot.env
  dc up -d --no-deps api web || true
 fi
 exit "$code"
}
trap recover EXIT HUP INT TERM
dc stop api
stopped=true
metadata > "$backup_dir/catalog-before.json"
dc exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl' > "$backup_dir/db.sql"
test -s "$backup_dir/db.sql"
dc run --rm --no-deps --user "$(id -u):$(id -g)" -v "$PWD/$backup_dir:/backup" -e BACKUP_DIR=/backup api node dist/objects.js backup
test -s "$backup_dir/objects.json"
awk -v api="$api_ref" -v web="$web_ref" '
 /^API_IMAGE_REF=/ {print "API_IMAGE_REF=" api;next}
 /^WEB_IMAGE_REF=/ {print "WEB_IMAGE_REF=" web;next}
 {print}
' .local/pilot.env > .local/pilot.env.next
chmod 600 .local/pilot.env.next
mv .local/pilot.env.next .local/pilot.env
# Both migrations only add columns/tables/indexes; the previous images remain a rollback option.
dc run --rm --no-deps migrate
dc up -d --no-deps api
ready=false
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
 if dc exec -T api node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(async r=>{const d=await r.json();process.exit(r.ok&&d.release==='$release'?0:1)}).catch(()=>process.exit(1))"; then ready=true; break; fi
 sleep 2
done
[ "$ready" = true ]
metadata > "$backup_dir/catalog-after.json"
cmp "$backup_dir/catalog-before.json" "$backup_dir/catalog-after.json"
dc up -d --no-deps web
# Public routing/TLS is checked independently of container health.
ready=false
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
 if curl -fsS --connect-timeout 5 --max-time 10 https://seafoodeck.tiendn.io.vn/api/v1/health > "$backup_dir/health.json" && python3 -c 'import json,sys;assert json.load(open(sys.argv[1]))["release"]==sys.argv[2]' "$backup_dir/health.json" "$release"; then ready=true; break; fi
 sleep 2
done
[ "$ready" = true ]
finished=true
echo "Upgrade healthy: $release. Private backup: $backup_dir"
dc ps
