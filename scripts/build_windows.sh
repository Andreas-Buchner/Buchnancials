#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! grep -qi microsoft /proc/version 2>/dev/null; then
  echo "This wrapper is meant for WSL." >&2
  echo "Run scripts/build_windows.ps1 directly from Windows PowerShell if you are already on Windows." >&2
  exit 1
fi

if ! command -v powershell.exe >/dev/null 2>&1; then
  echo "powershell.exe is not available in this WSL environment." >&2
  echo "Run scripts/build_windows.ps1 from Windows PowerShell instead." >&2
  exit 1
fi

if ! powershell.exe -NoLogo -NoProfile -Command "exit 0" >/dev/null 2>&1; then
  echo "powershell.exe is present but could not be started from this WSL session." >&2
  echo "Windows interop may be disabled. Run scripts/build_windows.ps1 from Windows PowerShell instead." >&2
  exit 1
fi

case "$repo_root" in
  /mnt/*) ;;
  *)
    echo "The repository must live on a Windows-mounted path like /mnt/c/... for the Windows build to work from WSL." >&2
    exit 1
    ;;
esac

ps_script_win="$(wslpath -w "$repo_root/scripts/build_windows.ps1")"

echo "Forwarding the Windows build to PowerShell:"
echo "  $ps_script_win"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$ps_script_win"
