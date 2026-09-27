#!/usr/bin/env bash
# kimi-build.sh — startet Kimi (Builder) headless für einen Task im eigenen Worktree.
#
#   bash scripts/team/kimi-build.sh T-001          # neuer Task: Branch kimi/T-001 frisch von main
#   bash scripts/team/kimi-build.sh T-001 --fix    # Nachbesserung: setzt Kimis letzte Session fort,
#                                                  # Feedback aus .agents/handoff/T-001.feedback.md
#
# Briefing:  .agents/handoff/<ID>.md          (schreibt der Orchestrator)
# Ergebnis:  .agents/logs/<ID>.report.md      (Kimis Abschlussbericht + Diffstat + Guard-Ergebnis)
# Exit-Code: 0 = Kimi fertig & Guards ok · 2 = Guard verletzt · sonst = Kimi-/Setup-Fehler
set -uo pipefail

ID="${1:?Task-ID fehlt (z.B. T-001)}"
MODE="${2:-new}"
MAX_SECONDS="${KIMI_TIMEOUT:-3600}"

REPO="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
WT="$(dirname "$REPO")/luca-stach-kimi"
BRANCH="kimi/$ID"
BRIEF="$REPO/.agents/handoff/$ID.md"
FEEDBACK="$REPO/.agents/handoff/$ID.feedback.md"
AGENT_FILE="$REPO/.agents/agents/builder.md"
LOGDIR="$REPO/.agents/logs"
TS="$(date +%Y%m%d-%H%M%S)"
LOG="$LOGDIR/$ID-$TS.jsonl"
REPORT="$LOGDIR/$ID.report.md"
PROTECTED='^(\.github/|astro\.config\.mjs$|\.agents/|\.claude/|scripts/team/|AGENTS\.md$|CLAUDE\.md$)'

mkdir -p "$LOGDIR"
[ -f "$BRIEF" ] || { echo "Briefing fehlt: $BRIEF" >&2; exit 1; }

# --- Worktree einrichten (einmalig) ---------------------------------------
if [ ! -d "$WT/.git" ] && [ ! -f "$WT/.git" ]; then
  git -C "$REPO" worktree add "$WT" -b "kimi/_base" main >/dev/null || exit 1
fi
# Push aus Kimis Worktree technisch unmöglich machen
git -C "$REPO" config extensions.worktreeConfig true
git -C "$WT" config --worktree remote.origin.pushurl "DISABLED--kimi-builder-darf-nicht-pushen"

# --- Branch vorbereiten -----------------------------------------------------
if [ "$MODE" = "--fix" ]; then
  [ -f "$FEEDBACK" ] || { echo "Feedback fehlt: $FEEDBACK" >&2; exit 1; }
  git -C "$WT" checkout "$BRANCH" >/dev/null 2>&1 || { echo "Branch $BRANCH existiert nicht" >&2; exit 1; }
else
  git -C "$WT" reset --hard -q
  git -C "$WT" clean -fdq
  git -C "$WT" checkout -q -B "$BRANCH" main || exit 1
fi
BASE="$(git -C "$REPO" rev-parse main)"

if [ ! -d "$WT/node_modules" ]; then
  (cd "$WT" && npm ci --no-audit --no-fund >/dev/null 2>&1) || { echo "npm ci im Worktree fehlgeschlagen" >&2; exit 1; }
fi

# --- Kimi starten -------------------------------------------------------------
if [ "$MODE" = "--fix" ]; then
  PROMPT="Nachbesserung für Task $ID. Der Orchestrator (Claude) hat Folgendes gefunden. Behebe ALLE Punkte, verifiziere erneut, committe lokal und schreibe danach deinen Abschlussbericht im vorgegebenen Format.

$(cat "$FEEDBACK")"
  ARGS=(-c -p "$PROMPT")
else
  PROMPT="Neuer Task $ID. Du arbeitest im Worktree $WT auf Branch $BRANCH. Briefing vom Orchestrator:

$(cat "$BRIEF")"
  ARGS=(--agent-file "$AGENT_FILE" -p "$PROMPT")
fi

echo "[$(date +%T)] Kimi startet ($ID, $MODE, Timeout ${MAX_SECONDS}s) — Log: $LOG"
(cd "$WT" && timeout "$MAX_SECONDS" kimi "${ARGS[@]}" --output-format stream-json >"$LOG" 2>"$LOG.stderr")
KIMI_EXIT=$?
echo "[$(date +%T)] Kimi beendet (exit $KIMI_EXIT)"

# --- Guards -----------------------------------------------------------------
GUARD="ok"
UNCOMMITTED="$(git -C "$WT" status --porcelain)"
CHANGED="$(git -C "$WT" diff --name-only "$BASE"...HEAD)"
BAD="$( { echo "$CHANGED"; echo "$UNCOMMITTED" | cut -c4-; } | grep -E "$PROTECTED" | sort -u)"
[ -n "$BAD" ] && GUARD="VERLETZT — geschützte Dateien geändert: $(echo $BAD)"
[ -z "$CHANGED" ] && [ "$GUARD" = "ok" ] && GUARD="WARNUNG — keine Commits auf $BRANCH"

# --- Report -----------------------------------------------------------------
FINAL="$(node -e '
  const fs=require("fs");let last="";
  for (const l of fs.readFileSync(process.argv[1],"utf8").split("\n")) {
    try { const m=JSON.parse(l); if (m.role!=="assistant") continue;
      const c=m.content; const t=typeof c==="string"?c:(Array.isArray(c)?c.filter(x=>x.type==="text").map(x=>x.text).join("\n"):"");
      if (t.trim()) last=t; } catch {}
  }
  process.stdout.write(last||"(kein Abschlusstext gefunden)");' "$LOG" 2>/dev/null)"

{
  echo "# Kimi-Report $ID ($TS, Modus $MODE)"
  echo
  echo "- Kimi-Exit: $KIMI_EXIT$([ $KIMI_EXIT -eq 124 ] && echo ' (TIMEOUT)')"
  echo "- Guard: $GUARD"
  echo "- Branch: $BRANCH · Worktree: $WT"
  echo "- Log: $LOG"
  echo
  echo "## Commits"; git -C "$WT" log --oneline "$BASE"..HEAD
  echo; echo "## Diffstat"; git -C "$WT" diff --stat "$BASE"...HEAD
  [ -n "$UNCOMMITTED" ] && { echo; echo "## Nicht committet"; echo "$UNCOMMITTED"; }
  echo; echo "## Kimis Abschlussbericht"; echo "$FINAL"
} >"$REPORT"

cat "$REPORT"
[ "$KIMI_EXIT" -ne 0 ] && exit "$KIMI_EXIT"
[[ "$GUARD" == VERLETZT* ]] && exit 2
exit 0
