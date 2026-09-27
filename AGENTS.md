# AGENTS.md — Luca Stach Portfolio (STACH://FLIGHTDECK)

## Was das ist
Persönliche Website von Luca Stach (BizOps & AI Automation). Astro 5 + Tailwind v4 + TypeScript, bilingual (DE `/`, EN `/en/`), Copy in `src/i18n/de.json` + `en.json`. Deploy: GitHub Actions → StatiCrypt verschlüsselt HTML → GitHub Pages (`https://nimo235.github.io/luca-stach/`). Repo: `github.com/NiMo235/luca-stach`.

## Unser Arbeitsansatz (immer so)
1. **Konzept zuerst** — nie direkt losbauen. Idee vorstellen, Rückfragen stellen, Richtung mit dem User klären.
2. **Hintergrund-Agent baut** — ein fokussierter Builder-Agent bekommt ein detailliertes, in sich geschlossenes Briefing (Umgebung, Stack, bestehende Features, Hard Constraints, Cut-List, Verifikations-Anforderungen). Läuft als Background-Task (~30–60 Min).
3. **Orchestrator verifiziert selbst** — Build, Preview, curl beider Locales, i18n-Leaks, Fallback-Pfade, Asset-Checks. Nicht blind vertrauen.
4. **Push = Auto-Deploy** — Workflow läuft, Orchestrator watched den Run und verifiziert live (verschlüsselte Seite, Chunks 200, keine Plaintext-Leaks).
5. **Bericht an den User** — was neu ist, Passwort, ehrliche Einschränkungen.

## Team-Betrieb (zwei Instanzen)
- **Claude = Orchestrator / Ops.** Schreibt Briefings, reviewt, verifiziert, merged, pusht und prüft den Deploy. Arbeitet im Haupt-Checkout `luca-stach/` auf `main`. Ablauf: `.claude/skills/team/SKILL.md`.
- **Kimi = Builder.** Wird headless über `bash scripts/team/kimi-build.sh <ID>` gestartet. Arbeitet ausschließlich im Worktree `../luca-stach-kimi/` auf Branch `kimi/<ID>`. Rolle: `.agents/agents/builder.md`.
- **Warteschlange:** `.agents/BOARD.md`. Briefings, Feedback: `.agents/handoff/`. Reports, Logs: `.agents/logs/` (nicht versioniert).
- Bis `ready` läuft alles autonom (Briefing → Build → Review → Nachbesserung, max. 3 Runden). Merge, Push und Deploy erst nach Freigabe durch den User (`/team merge <ID>`).
- Guards: Aus Kimis Worktree ist Push technisch deaktiviert. Änderungen an geschützten Pfaden (`.github/`, `astro.config.mjs`, `.agents/`, `.claude/`, `scripts/team/`, `AGENTS.md`, `CLAUDE.md`) verwirft der Wrapper.
- Nutzt der User Kimi interaktiv, gilt dieselbe Rollenverteilung: Kimi baut auf eigenem Branch, Claude merged.

## Hard Constraints (niemals brechen)
- `.github/workflows/deploy.yml` und `astro.config.mjs` gehören dem Orchestrator — Builder-Agents fassen sie nicht an.
- Agents pushen niemals. Nur lokale Commits. Push macht der Orchestrator.
- i18n: Jeder neue String in BEIDE JSON-Dateien. Kein hardcodierter Copy-Text in Components.
- Fallbacks sind heilig: `prefers-reduced-motion`, No-JS, Mobile (<1024px oder coarse pointer) → klassische Ansicht muss immer voll funktional bleiben. Alle Flight-Deck-Regeln unter `html.flightdeck` scopen.
- StatiCrypt-Kompatibilität: `dist`-Struktur nicht ändern, Assets bleiben plain unter `dist/_astro/`.
- Performance: three.js/gsap nur lazy via dynamic `import()`, nie statisch im Entry-Chunk.
- Kein Telefonnummer/Adresse auf der Site. Kontakt: E-Mail + LinkedIn + CV-Download (unratbarer Dateiname).

## Verifikations-Checkliste (vor jedem Push)
- [ ] `npm run build` ohne Fehler
- [ ] Preview: `/luca-stach/` + `/luca-stach/en/` → 200, Kern-Copy vorhanden
- [ ] Alle referenzierten `_astro/*` Assets existieren & 200
- [ ] Kein statischer three/gsap-Import im Entry-Chunk
- [ ] Keine i18n-Leaks (DE↔EN gegenseitig grep'en)
- [ ] Nach Deploy: Live-Seite verschlüsselt, Plaintext-Grep = 0, neue Chunks 200
