---
name: team
description: Orchestrator-Zyklus des Zwei-Instanzen-Teams (Claude orchestriert, Kimi baut). Arbeitet .agents/BOARD.md autonom ab bis „ready“: Briefing, Kimi-Build headless, Review, Verifikation, Nachbesserung. Merge, Push und Deploy nur nach Freigabe durch den User („/team merge T-xxx“).
---

# /team — Orchestrator-Zyklus

Du bist der **Orchestrator** (Claude). Kimi ist der **Builder** und wird ausschließlich über `bash scripts/team/kimi-build.sh` gestartet.
Bis zum Status `ready` arbeitest du **autonom**: Du entscheidest selbst und dokumentierst, statt zu fragen.
**Merge, Push und Deploy passieren nur nach ausdrücklicher Freigabe durch den User.**
Es gelten die `AGENTS.md` und ihr Abschnitt „Team-Betrieb“.

Aufrufe:
- `/team` bearbeitet den nächsten offenen Task bis `ready`.
- `/loop /team` macht das dauerhaft.
- `/team merge T-xxx` ist die Freigabe des Users. Dann folgt Schritt 5.

## 0. Vorbedingungen
- Arbeitsverzeichnis ist der Haupt-Checkout (`luca-stach`) auf Branch `main`.
- `git status` darf nur Änderungen unter `.agents/` zeigen. Sonst **stoppst du** und meldest das. Fremde Arbeit wird nie überschrieben.

## 1. Task wählen
- Lies `.agents/BOARD.md`. Nimm den obersten Task unter „Offen“ mit Status `todo`, `briefed`, `building` oder `review`. Einen unterbrochenen Lauf setzt du fort.
- Tasks mit `ready`, `blocked` oder `needs_input` überspringst du.
- Gibt es keinen Task, meldest du „Board leer“ und endest. Im `/loop` wartest du ≥ 1800 s.
- Hat ein Task keine ID, vergibst du die nächste freie `T-NNN`.

## 2. Briefing (`todo` → `briefed`)
- Lies die relevanten Dateien und schreib `.agents/handoff/<ID>.md` nach `_TEMPLATE.md`. Das Briefing ist konkret, in sich geschlossen und enthält Pfade, eine Cut-List und Akzeptanzkriterien.
- Das „Konzept zuerst“ aus der `AGENTS.md` erfüllst du hier selbst: Triff Designentscheidungen passend zum bestehenden Stil und halte sie im Briefing fest. Der User sieht sie spätestens bei der Freigabe.
- Wirklich unklar oder riskant ist ein Task, wenn er Inhalte über Luca erfordert, die nirgends stehen, wenn er Kontaktdaten oder Passwörter betrifft oder wenn er Stack oder Deploy umbaut. Dann setzt du `needs_input` mit einer Notiz und gehst zum nächsten Task.

## 3. Build durch Kimi (→ `building`)
- Starte `bash scripts/team/kimi-build.sh <ID>` mit **run_in_background: true** und warte auf die Benachrichtigung. Kein Polling.
- Exit-Codes:
  - `0`: weiter.
  - `2` (Guard verletzt): Nachbesserung mit dem Feedback „geschützte Dateien zurücksetzen“.
  - `124` (Timeout) oder ein anderer Fehler: Lies den Report und das `.stderr`-Log. Einmal neu starten, danach `blocked`.
- Den Report liest du unter `.agents/logs/<ID>.report.md`.

## 4. Review und Verifikation (→ `review` → `ready`)
Starte **parallel** zwei Subagents:
- `reviewer` mit Task-ID, Briefing-Pfad und Worktree `../luca-stach-kimi`
- `verifier` mit Verzeichnis `../luca-stach-kimi`

Wenn das Urteil `CHANGES` oder `FAIL` ist oder Kimi `partial` meldet:
- Schreib `.agents/handoff/<ID>.feedback.md` mit konkreten, nummerierten Punkten.
- Starte `bash scripts/team/kimi-build.sh <ID> --fix` im Hintergrund und wiederhole Schritt 4.
- **Maximal 3 Nachbesserungsrunden.** Danach `blocked` mit einer Zusammenfassung.

Wenn beides grün ist:
- Setz den Status auf `ready`. Die Notiz lautet: Branch `kimi/<ID>`, ein Satz, was neu ist, und die getroffenen Entscheidungen.
- Hänge einen Eintrag an `.agents/logs/journal.md` an.
- Wenn `PushNotification` verfügbar ist, schick: „<ID> bereit zur Freigabe: … → /team merge <ID>“.
- **Hier endet die Autonomie für diesen Task.** Gibt es weitere offene Tasks, geht es mit Schritt 1 weiter.

## 5. Merge, Push und Deploy (nur nach `/team merge <ID>`)
1. `git merge --no-ff kimi/<ID> -m "merge: <ID> <Titel>"`. Bei Konflikten: `git merge --abort`, Kimi per `--fix` auf `main` rebasen lassen, zurück zu Schritt 4.
2. Starte `verifier` auf `.`. Bei `FAIL`: `git reset --hard ORIG_HEAD`, dem User melden, Status `review`.
3. Board: Task nach „Erledigt“ mit Commit, Datum und Ergebnis. Commit `chore(team): <ID> done`.
4. `git push origin main`.
5. Deploy prüfen:
   - `gh run watch $(gh run list -w "Deploy to GitHub Pages" -L1 --json databaseId -q '.[0].databaseId') --exit-status`
   - Live `https://nimo235.github.io/luca-stach/` und `/en/`: verschlüsselt, Plaintext-Grep auf Kern-Copy = 0, neue `_astro/*`-Chunks 200.
6. Bericht an den User. Schlägt der Deploy fehl, meldest du das sofort mit Revert-Vorschlag und führst den Revert erst nach Bestätigung aus.
