#!/bin/sh
# Read-only diagnostics. No installation, firewall edits or secret/config dumps.
set -u
printf '\n[OS]\n'
cat /etc/os-release
printf '\n[CPU architecture]\n'
uname -m
printf '\n[vCPU]\n'
getconf _NPROCESSORS_ONLN
printf '\n[Memory]\n'
free -h
printf '\n[Disk]\n'
df -h /
printf '\n[Docker]\n'
if command -v docker >/dev/null 2>&1; then
  docker --version
  docker compose version
  if docker info >/dev/null 2>&1; then
    docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
  else
    printf '%s\n' 'Docker daemon unavailable to this user; run sudo docker ps if installed.'
  fi
else
  printf '%s\n' 'Docker is not installed.'
fi
printf '\n[Listening TCP ports]\n'
if command -v ss >/dev/null 2>&1; then ss -lnt; else printf '%s\n' 'ss is not available.'; fi
