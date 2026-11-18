#!/bin/sh
set -eu
# Run only after testing these exact two local images. Never changes the VPS.
tag=${1:-pilot-internal-20261118-r2}
case "$tag" in *[!a-zA-Z0-9_.-]*|'') echo 'Invalid tag' >&2; exit 2;; esac
for service in api web; do
  local_ref="seafoodeck-$service:$tag"
  remote_ref="ghcr.io/tiendn1408/seafoodeck-$service:$tag"
  test "$(docker image inspect "$local_ref" --format '{{.Architecture}}')" = amd64
  docker tag "$local_ref" "$remote_ref"
  docker push "$remote_ref"
  docker image inspect "$remote_ref" --format '{{join .RepoDigests "\n"}}'
done
