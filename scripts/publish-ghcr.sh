#!/bin/sh
# Publish the existing, tested image. Login interactively before running this.
set -eu

if [ "$#" -gt 2 ]; then
  printf '%s\n' 'Usage: sh scripts/publish-ghcr.sh [release-tag] [local-image]' >&2
  exit 2
fi

release_tag=${1:-flat-illustrations-20261117}
local_image=${2:-seafoodeck:flat-illustrations-20261117}
case "$release_tag" in
  ''|*[!a-zA-Z0-9_.-]*|[-.]*)
    printf '%s\n' 'Invalid release tag.' >&2
    exit 2
    ;;
esac
if [ "${#release_tag}" -gt 128 ]; then
  printf '%s\n' 'Release tag must not exceed 128 characters.' >&2
  exit 2
fi

image_ref="ghcr.io/tiendn1408/seafoodeck:$release_tag"
printf '%s\n' 'Source image (must already be tested):'
docker image inspect --format '{{.Id}} {{.Os}}/{{.Architecture}}' "$local_image"
printf 'Publishing %s as %s\n' "$local_image" "$image_ref"
docker tag "$local_image" "$image_ref"
docker push "$image_ref"
printf '\nPublished: %s\n' "$image_ref"
printf '%s\n' 'Registry digest references (use the GHCR reference on the VPS):'
docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$image_ref"
