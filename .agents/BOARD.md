# Team-Board

Hier steht die Warteschlange für das Team. Claude arbeitet sie mit `/team` von oben nach unten ab.
**Neue Aufgabe:** eine Zeile unter „Offen“ eintragen. Ein Satz reicht, Claude schreibt das Briefing selbst.

Status: `todo` → `briefed` → `building` → `review` → `done`. Bei Problemen `blocked` oder `needs_input`.

## Offen
| ID | Aufgabe | Status | Notiz |
|----|---------|--------|-------|
| T-101 | Halle statisch & schön: Modul src/scripts/halle/ (FlightWorld-Interface), Hülle/Regal/Look/Kamerafahrt/Title-Card, flightdeck lädt Halle | ready | siehe docs/concepts/T-001-halle.md §12 |
| T-102 | Die Halle lebt: Wegenetz+Reservierung, 25–40 AGVs, Shuttles, RBGs, Power-up-Intro, AGV per Klick anhalten | ready | nach T-101 |
| T-103 | Zonen + Tippen: Leitstand, Förderloop, Prüfstraße, Gefahrgut, Mezzanine, Pausenraum, Tore; Hotspots + Minimap → Flug-Fahrt | ready | nach T-102 |
| T-104 | Inhalte interaktiv: LOG-Paletten, Leitstand manuell↔Pipeline (ROI), Prüfstraße, DOCK verladen; Warehouse-Toy raus | ready | nach T-103 |
| T-105 | Atmosphäre: Schichten Früh/Spät/Nacht, Layer-Toggles, Datenströme, Pausenraum-Audio | todo | nach T-104 |
| T-106 | Härtung: Qualitätsstufen, Perf, i18n, A11y, Fallbacks, flightworld.ts entfernen | todo | nach T-105 |

## Erledigt
| ID | Aufgabe | Commit | Datum | Ergebnis |
|----|---------|--------|-------|----------|
| T-001 | Konzept Lagerhalle | 90b692d | 2026-09-27 | docs/concepts/T-001-halle.md, Entscheidungen §12 |
