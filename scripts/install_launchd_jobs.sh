#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LAUNCH_AGENTS_DIR="${HOME}/Library/LaunchAgents"
TEMPLATE_DIR="${ROOT_DIR}/ops/launchd"
LOG_DIR="${ROOT_DIR}/logs"
USER_DOMAIN="gui/$(id -u)"
HOME_DIR="${HOME}"
DEFAULT_PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
BIN_PATH="${DEFAULT_PATH}"

prepend_bin_dir() {
  local binary_name="$1"
  local resolved
  resolved="$(command -v "${binary_name}" 2>/dev/null || true)"
  if [ -z "${resolved}" ] && [ -n "${SHELL:-}" ]; then
    resolved="$("${SHELL}" -lc "command -v ${binary_name}" 2>/dev/null || true)"
  fi
  if [ -z "${resolved}" ]; then
    return
  fi
  local dir_path
  dir_path="$(dirname "${resolved}")"
  case ":${BIN_PATH}:" in
    *":${dir_path}:"*) ;;
    *) BIN_PATH="${dir_path}:${BIN_PATH}" ;;
  esac
}

prepend_bin_dir "codex"
prepend_bin_dir "claude"

mkdir -p "${LAUNCH_AGENTS_DIR}" "${LOG_DIR}"

install_job() {
  local label="$1"
  local template_path="${TEMPLATE_DIR}/${label}.plist.template"
  local target_path="${LAUNCH_AGENTS_DIR}/${label}.plist"

  sed \
    -e "s|__PROJECT_ROOT__|${ROOT_DIR}|g" \
    -e "s|__HOME__|${HOME_DIR}|g" \
    -e "s|__BIN_PATH__|${BIN_PATH}|g" \
    "${template_path}" > "${target_path}"

  if launchctl print "${USER_DOMAIN}/${label}" >/dev/null 2>&1; then
    launchctl bootout "${USER_DOMAIN}/${label}" >/dev/null 2>&1 || true
  fi

  launchctl bootstrap "${USER_DOMAIN}" "${target_path}"
  launchctl enable "${USER_DOMAIN}/${label}"
}

install_job "com.coolpaper.cool-daily"
install_job "com.coolpaper.hf-daily"
install_job "com.coolpaper.trending"

echo "Installed launchd jobs:"
launchctl print "${USER_DOMAIN}/com.coolpaper.cool-daily" | sed -n '1,20p'
launchctl print "${USER_DOMAIN}/com.coolpaper.hf-daily" | sed -n '1,20p'
launchctl print "${USER_DOMAIN}/com.coolpaper.trending" | sed -n '1,20p'
