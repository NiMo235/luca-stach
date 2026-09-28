# Team-Board

Hier steht die Warteschlange für das Team. Claude arbeitet sie mit `/team` von oben nach unten ab.
**Neue Aufgabe:** eine Zeile unter „Offen“ eintragen. Ein Satz reicht, Claude schreibt das Briefing selbst.

Status: `todo` → `briefed` → `building` → `review` → `done`. Bei Problemen `blocked` oder `needs_input`.

## Offen
| ID | Aufgabe | Status | Notiz |
|----|---------|--------|-------|

## Erledigt
| ID | Aufgabe | Commit | Datum | Ergebnis |
|----|---------|--------|-------|----------|
| T-101 | Halle statisch & schön | merge | 2026-09-27 | 3 Runden, Kollision 0 |
| T-102 | Die Halle lebt (32 AGVs, Shuttles, RBGs, LKW, Stau per Tap) | merge | 2026-09-28 | Sim PASS, 72 % in Fahrt |
| T-103 | Zonen + Hotspots + Minimap | merge | 2026-09-28 | Blocker (Panels) behoben |
| T-104 | Inhalte interaktiv, Warehouse-Toy entfernt | merge | 2026-09-28 | CDP-Checks PASS |
| T-105 | Schichten + Layer + Datenströme | merge | 2026-09-28 | von Claude fertiggestellt (Kimi-Limit) |
| T-106 | Härtung: adaptive Qualität, Fallbacks, flightworld raus | merge | 2026-09-28 | Claude (Kimi-Limit) |
| T-001 | Konzept Lagerhalle | 90b692d | 2026-09-27 | docs/concepts/T-001-halle.md, Entscheidungen §12 |
