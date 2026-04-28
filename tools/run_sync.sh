#!/bin/bash
# Hufterproof Exact Online sync.
# Wordt elk uur aangeroepen door launchd (com.johnnycashew.exactsync).
# Voert alleen een sync uit als dataset.json ouder is dan MAX_AGE_HOURS.
#
# Eigenschappen:
#   - flock: voorkomt overlappende runs
#   - freshness-check: skip als data recent
#   - alle output naar sync.log met timestamp
#   - bij falen: macOS notificatie + duidelijke marker in log
#   - probeert meerdere python paden

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

LOG="$SCRIPT_DIR/sync.log"
LOCK="$SCRIPT_DIR/.sync.lock"
DATASET="$SCRIPT_DIR/dataset.json"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-20}"

ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "$(ts) — $*" >> "$LOG"; }

# Single instance (non-blocking)
exec 9>"$LOCK"
if ! flock -n 9; then
    log "SKIP: andere sync draait nog (lock)"
    exit 0
fi

# Freshness check — alleen draaien als data te oud is
if [ -f "$DATASET" ]; then
    AGE_SEC=$(( $(date +%s) - $(stat -f %m "$DATASET") ))
    AGE_HOURS=$(( AGE_SEC / 3600 ))
    if [ "$AGE_HOURS" -lt "$MAX_AGE_HOURS" ]; then
        log "SKIP: dataset.json is ${AGE_HOURS}h oud (<${MAX_AGE_HOURS}h)"
        exit 0
    fi
    log "Dataset is ${AGE_HOURS}h oud — sync nodig"
else
    log "Geen dataset.json gevonden — eerste sync"
fi

# Vind een werkende python3
PY=""
for cand in \
    /Library/Frameworks/Python.framework/Versions/3.11/bin/python3 \
    /opt/homebrew/bin/python3 \
    /usr/local/bin/python3 \
    /usr/bin/python3; do
    if [ -x "$cand" ] && "$cand" -c "import requests" >/dev/null 2>&1; then
        PY="$cand"
        break
    fi
done
if [ -z "$PY" ]; then
    log "FOUT: geen python3 met 'requests' module gevonden"
    osascript -e 'display notification "Geen werkende python3 met requests-module gevonden" with title "Exact Sync FAILED"' 2>/dev/null || true
    exit 1
fi

log "Sync gestart met $PY"

# Run sync; alle output naar log
"$PY" "$SCRIPT_DIR/exact_sync.py" >> "$LOG" 2>&1
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    log "✅ Sync OK"
else
    log "❌ SYNC MISLUKT (exit $EXIT_CODE)"
    osascript -e "display notification \"Exact sync exit $EXIT_CODE — check sync.log\" with title \"Johnny Cashew Sync FAILED\"" 2>/dev/null || true
fi

exit $EXIT_CODE
