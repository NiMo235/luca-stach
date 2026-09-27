# T-001 — Konzept: „DIE HALLE"
## Ein begehbares Zukunfts-Logistikzentrum als Herzstück von STACH://FLIGHTDECK

**Status:** Konzept zur Entscheidung durch Luca. Kein Produktionscode.
**Vorlage:** [Villa Ravine — Real-time Architectural Model](https://kafe45einjydi.ok.kimi.link) (prozedurale three.js-Architektur, Viewpoints, Time-of-day, Layer, Grundriss-Karte).
**Vorgabe Lucas:** Zukunfts-Szenerie behalten, aber eine detaillierte Lagerhalle mit kreativen Konzepten, frei begehbar, „wie eine richtige Simulation und kein Minigame", „ein Konzept, das wirklich flashed".

---

## 1. Vision in einem Absatz

Der Besucher bootet wie heute ins Flightdeck — aber hinter „ACCESS GRANTED" steht kein abstrakter Datenkorridor mehr, sondern **ein Gebäude**. Die Kamera sinkt durch das geöffnete Hallendach in ein Logistikzentrum der Zukunft: 120 × 60 Meter Stahl, Beton und Licht. Hochregale ragen zwölf Ebenen hoch, fahrerlose Transportfahrzeuge ziehen ihre Bahnen, Regalbediengeräte fahren Paletten, an den Toren docken LKW an, und über allem schwebt eine zweite, unsichtbare Ebene: der Datenfluss als Licht. **Jede Zone der Halle ist ein Kapitel von Lucas Leben und Arbeit — gelagert, gefördert, geprüft, verladen.** Die bisherigen Stationen BOOT, PROOF, LOG, WORK, STACK, BEYOND und DOCK werden nicht gelöscht, sondern **in Raum übersetzt**. Die Halle ist keine Kulisse: Sie läuft. Aufträge entstehen, Fahrzeuge reservieren Wege, Puffer füllen sich, Schichten wechseln — und der Besucher kann eingreifen und zusehen, wie die Kette reagiert.

Warum das flasht: Es verbindet die Referenz-Qualität (Architekturmodell, Material, Licht, Kamerafahrten) mit etwas, das die Referenz nicht hat — **ein lebendes System mit Kausalität**. Und es ist die ehrlichste Selbstdarstellung, die ein BizOps-Mensch einer Chemielogistik-Spedition bauen kann: Seine Website *ist* sein Arbeitsplatz.

---

## 2. Die ersten 5 Sekunden

Der Cold Boot bleibt exakt wie heute (getippte Init-Zeilen, Skip per Taste), mit einer geänderten Zeile:

```
STACH://FLIGHTDECK v2.4 — cold boot
mounting subsystems
halle.geometry .............. [OK]
simulation.agents ........... [OK]
hud.telemetry ............... [OK]
audio.engine ................ [STANDBY]
identity .................... LUCA STACH
ACCESS GRANTED
```

Danach, in einer ununterbrochenen Bewegung (~4 s, skippbar):

1. **0.0–0.8 s** — Overlay fadet. Die Kamera hängt unter dem Hallendach bei Nacht. Man sieht nur: Dachstuhl-Silhouetten, dunkle Regalreihen, das Blaulicht des Gefahrgutkäfigs, Kondensstreifen-ähnliche Lichtschlitze der Oberlichter. Draußen vor den Toren glimmt der Hof.
2. **0.8–2.8 s** — **Power-up-Sequenz:** Die Halle „fährt hoch". Zone für Zone klicken die Lichtlinien an — zuerst die Notausgang-Strips am Boden, dann die Hochregal-Gänge von oben nach unten, die AGV-Loop-Bodenmarkierungen, der Förderloop, der Leitstand (sein Holo-Screen fährt wie ein Terminal hoch), zuletzt warm: der Pausenraum. Gleichzeitig erwacht die Simulation: Der erste AGV löst sich vom Ladeplatz, ein Regalbediengerät fährt los. Das ist der Moment, der bleibt.
3. **2.8–4.0 s** — Die Kamera gleitet auf einer weichen Kurve zur **Besucher-Galerie** (Viewpoint 01) und parkt. Die **Titel-Card** materialisiert wie in der Referenz: `DIE HALLE — Logistikzentrum der Zukunft · Echtzeit-Modell · prozedurale Geometrie`, darunter live `triangles`, `parts`, `fps`. HUD fadet ein: Viewpoints, Schicht-Slider, Layer, Minimap.

Reduced Motion / Mobile / No-JS: nichts davon — die klassische Ansicht bleibt unverändert (siehe §10).

---

## 3. Hallen-Layout

### 3.1 Grundriss (Draufsicht, Norden oben)

Gesamtmaß **120 × 60 m**, Firsthöhe ~14 m, Hochregal ~12 m, Mezzanine +6 m. Einheiten in Metern.

```
                         NORD — LKW-HOF / RAMPEN (y = 0)
   0        20        40        60        80       100       120
   ┌─────────┬─────────┬─────────┬─────────┬─────────┬───────────┐
   │  TOR 1  │  TOR 2  │  TOR 3  │  TOR 4  │ GEFAHR- │  GEFAHR-  │
   │  DOCK   │ EINLAG. │ PRÜF-   │ AUSLAG. │ GUT A   │  GUT B    │ y 0–8
   │(Kontakt)│         │ STRASSE │ (GPS)   │ Klasse 3│  Klasse 8 │
   ├─────────┴────┬────┴────┬────┴─────────┴────┬────┴───────────┤
   │              │ BÜHNE / │   FÖRDERLOOP ═══════════════╗     │ y 8–14
   ├──────────┬───┤ PUFFER  │   ║ Kommissionier-  ║      ║     │
   │ HOCH-    │HRL│         │   ║ Loop: AGV-      ║      ║     │
   │ REGAL    │-  │         │   ║ Kreuzung (WORK) ║      ║     │
   │ GANG A   │EIN-│        │   ║  o───o───o      ║      ║     │ y 14–46
   │ GANG B   │GÄNG│        │   ║  │   │   │       ║      ║     │
   │ GANG C   │E  │         │   ║  o───o───o       ║      ║     │
   │ 12 Ebenen│   │         │   ║  Pick-Stationen  ║      ║     │
   │ RBG ×2   │   │         │   ╚═══╦══════════════╝      ║     │
   │ (LOG)    │   │         │       ║ zum Packplatz       ║     │
   ├──────────┴───┴─────────┤       ▼                     ║     │
   │                        │   LEITSTAND (LLM-Angebote,  ║     │
   │ BEYOND: Pausenraum     │   PROOF/W1) ════════════════╝     │ y 46–52
   │ DJ · Gym · Podcast     │                                   │
   ├────────────────────────┤   MEZZANINE (STACK), Ebene +6 m:  │
   │ BESUCHER-GALERIE (BOOT)│   Skill-Regale über Leitstand    │ y 52–60
   │ Eingang · Terminal     │                                   │
   └────────────────────────┴───────────────────────────────────┘
                         SÜD — BESUCHERZUGANG
```

### 3.2 Zonen, Inhalte, Viewpoints

Die Zonen-Namen der Site (BOOT/PROOF/LOG/WORK/STACK/BEYOND/DOCK) bleiben als **HUD-Labels und Viewpoint-Namen** erhalten — die Vertrautheit des Flightdecks über einer neuen Welt.

| Zone (Ort) | Station | Inhalt von Luca (Quelle: `de.json`) | Viewpoint |
|---|---|---|---|
| Besucher-Galerie (Süd, +4 m) | BOOT | Hero-Intro, interaktives Terminal | 01 „Anflug — Galerie" |
| Vogelperspektive | — | Gesamtüberblick, Power-State der Halle | 02 „Aerial" |
| Hochregal, 3 Gänge (West) | LOG | 5 Lebensstationen als Paletten (`log.entries`) | 03 „Hochregal-Gang" |
| AGV-Kreuzung + Kommi-Loop (Mitte) | WORK | Operative Fläche, Ticker-Begriffe als Paketaufkleber | 04 „AGV-Kreuzung" |
| LLM-Leitstand (Ost) | PROOF / W1 | Case 01 Angebotssystem + `proof.stats` (−67 %, <3 J., 5 Prozesse, 1.4) | 05 „Leitstand" |
| Prüfstraße (Nord-Mitte) | W2 | Case 02 Frachtrechnungsprüfung | 06 „Prüfstraße" |
| Tor 4 + Datenstrom-Layer | W3 | Case 03 Sendungsverfolgung (GPS-Linien) | (in 06 enthalten) |
| Gefahrgut-Käfig A/B (Nordost) | LOG/Chemie | KAM Chemie & Gefahrgut (`log.entries[1]`) | 07 „Gefahrgut" |
| Mezzanine (+6 m, Ost) | STACK | `stack.tools`/`stack.methods` als Regalbehälter mit Füllstand = Level | 08 „Mezzanine" |
| Pausenraum (Südwest) | BEYOND | DJ/Sequencer, Gym, Podcast, Sprachen, Zertifikate | 09 „Pausenraum" |
| Tor 1 (Nord) | DOCK | Kontakt: Mail, LinkedIn, CV (`contact.*`) | 10 „Tor 1 — Verladung" |

**Regel (Cut-List-konform):** Alle Texte kommen aus den vorhandenen `de.json`/`en.json`-Inhalten bzw. werden als neue i18n-Keys in BEIDE Dateien gelegt. Jede simulierte Zahl (Durchsatz, Wartezeiten, auch das −67 %-Live-Modell) trägt sichtbar den Hinweis „Modell".

---

## 4. Navigation

Drei Navigationsmodi, die ineinander übergehen — plus die bewährte DOM-Ebene.

### 4.1 Tour (Default, scroll-getrieben — wie heute)
- Der **Scroll bleibt der rote Faden**: Statt des Korridors fährt die Kamera jetzt zwischen den 10 Viewpoints durch die Halle. Die bestehende Architektur trägt das fast unverändert: `CAM_KEYS`/`LOOK_KEYS` werden zu Viewpoint-Ankern, die CatmullRom-Spline wird eine Rundroute *innerhalb* der Halle (unter dem Dach, durch den Hochregal-Gang, über den Loop).
- Station-Panels (DOM, bestehende `.astro`-Inhalte) materialisieren weiterhin beim Andocken — Inhalte, A11y und i18n bleiben im DOM, nicht in WebGL. Das ist der wichtigste Architektur-Erhalt.
- HUD-Telemetrie bleibt (SCROLL/VELOCITY/STATION/POS), Station-Buttons fliegen weiterhin per `flyTo`.

### 4.2 Orbit (ange docktem Zustand)
- Solange die Kamera an einem Viewpoint „parkt", darf der Besucher frei orbiten (OrbitControls aus `three/examples`, gedämpft): ziehen = orbiten, Scroll weiterhin = nächster Viewpoint (Zoom nur über `Z`-Taste/Pinch-Geste — Scroll ist der Tour vorbehalten; **Entscheidung**, um Konflikte zu vermeiden), Rechtsklick = Pan.
- Beim Weiterscrollen rastet die Kamera sanft zurück auf die Spline.

### 4.3 Walk-Modus (das „durch die Gänge gehen")
- Toggle per Taste `F` oder HUD-Button: PointerLock (aus `three/examples`), WASD + Maus, `Shift` = schnell, `Esc` = zurück. Augenhöhe 1,7 m, kein Fliegen (FLY-Modus bewusst gestrichen — Bodenkontakt macht die Halle groß).
- **Kollision, absichtlich einfach:** Die Halle hält eine Liste statischer AABBs (Regalstiele, Förderer, Leitstand, Käfig, Wände, Tore). Die Kamera ist eine Kapsel; pro Frame Achsen-getrennter Swept-AABB-Check, Slide entlang der Wand. Keine Physik-Engine, keine neue Dependency.
- AGVs haben Vorfahrt: Nähert sich ein AGV, piept es (leiser, Audio-abhängig) und der Besucher wird sanft weggeschoben (Kapsel-Abstand), nicht blockiert.
- Interaktion im Walk: `E` löst das aus, was im Orbit ein Klick ist (Palette öffnen, AGV anhalten, Konsole bedienen) — Raycast auf den Bildschirm-Mittelpunkt.

### 4.4 Minimap / Grundriss-Karte
- SVG-Grundriss unten links (einklappbar, wie in der Referenz): Zonen, Tore, Kamera-Pfeil, **live** AGV-Punkte und LKW an den Toren. Klick auf eine Zone = Viewpoint-Fahrt. Die Minimap ist zugleich die Bühne für Case 03: Ausgehende LKW ziehen GPS-Lichtlinien über den Hof hinaus.

### 4.5 Tastatur & Barrierefreiheit
- `1–9, 0` Viewpoints · `F` Walk · `M` Minimap · `L` Layer-Menü · `T` Schicht · `?` Hilfe-Overlay · `Esc` zurück.
- Viewpoints, Layer, Schicht sind echte `<button>`s; Station-Panels sind DOM mit Überschriften-Fokus (bestehender Mechanismus). Die 3D-Ebene bleibt `aria-hidden`; die klassische Ansicht bleibt die vollwertige, voll zugängliche Alternative.

---

## 5. Die Simulation — die Halle lebt

Grundsatz: **Regelbasiert, deterministisch lesbar, nicht gescriptet.** Man sieht Ursache und Wirkung. Das trennt sie vom „Minigame im Slide".

### 5.1 Entitäten

| Entität | Anzahl | Verhalten |
|---|---|---|
| AGV (fahrerloser Transport) | 6–8 (Qualitätsstufe-abhängig) | Fährt Aufträge auf dem Wegenetz, reserviert Strecken, lädt am Ladeplatz bei < 20 % |
| RBG (Regalbediengerät) | 2 (Gang A, Gang C) | Horizontal + Hub im Gang; holt/lagert Paletten; Gang B ist „Manuallager" (ruhig) |
| LKW | bis 4 (einer pro Tor) | State: `anfahrt → andocken → be-/entladen → abfahrt`; Hof-Animation hinter den Toren |
| Paletten | ~40 aktiv + ~300 statisch im Regal | InstancedMesh; Zustand: `Regal / Puffer / AGV / RBG / Bühne / LKW` |
| Pakete (Förderloop) | ~30 | InstancedMesh, laufen auf Förderkurven, Prüfstraße lenkt aus |
| Quote-Pakete (Leitstand) | ~12 | Daten-Pakete auf zwei Bahnen (manuell / Pipeline) |
| Menschen | 0 (bewusst) | „Menschen" sind Licht-Zustände an Arbeitsplätzen (Layer „Menschen vs. Automatisierung"), keine Charaktere — hält Scope und Stil sauber |

### 5.2 Wegenetz und Kollisionsvermeidung

```
 TOR2 ──► BÜHNE ──► PUFFER ──► HRL-EINGANG ──► RBG ──► Regalfach
                         │
                         ▼
              ┌──── KOMMI-LOOP (Einbahn!) ────┐
              │  Kreuzung K1   Kreuzung K2    │
              ▼                               │
        PICK-STATIONEN ──► FÖRDERER ──► PRÜFSTRASSE ──► PACK ──► TOR4
```

- Graph aus Knoten (Tore, Kreuzungen, Stationen, Ladeplatz) und gerichteten Kanten. **Einbahn-Loop** verhindert Deadlocks per Konstruktion.
- Wegfindung: A* über den Graphen (trivial bei ~40 Knoten).
- **Reservierung:** Ein AGV reserviert jeweils die nächste Kante; belegt → warten. Kreuzungen sind „Blöcke" (nur ein AGV im Block). Der Besucher kann das *sehen*: Im Layer „Datenströme" leuchtet die reservierte Kante vor dem AGV auf — die unsichtbare Logistik-Software wird sichtbar. Das ist Lucas Kerngeschäft als Bild.

### 5.3 Aufträge und Warteschlangen

- **Generator** erzeugt Aufträge nach Schicht-Profil (§5.5): `EINLAGERUNG` (LKW→Regal), `KOMMISSIONIERUNG` (Regal→Pack→Tor 4), `UMLAGERUNG` (Füller, hält das Bild lebendig).
- Prioritätswarteschlange; jede Station hat sichtbare **Puffer-Slots**. Läuft ein Puffer voll, staut es sich sichtbar bis zur Bühne — und die LKW-Verweilzeit im HUD steigt.

### 5.4 Zeitmodell

- **Fixed Timestep:** Sim tickt mit 10 Hz (Accumulator), Render interpoliert. Entkoppelt Sim-Qualität von fps; pausiert bei `document.hidden` (bestehendes Pattern).
- Sim läuft im **Main-Thread** (10 Hz × ~50 Agenten ist vernachlässigbar); Worker nur, wenn Messungen etwas anderes sagen.

### 5.5 Schichten (ersetzt „Time of day")

Der Schicht-Slider der Referenz wird zu **Früh / Spät / Nacht** — drei Presets, die Licht UND Betrieb ändern:

| Schicht | Auftragsrate | Licht | Besonderheit |
|---|---|---|---|
| Früh | 100 % | kühles Morgenlicht durch Oberlichter | alle Stationen besetzt (Arbeitsplatz-Lichter an) |
| Spät | 60 % | goldener Hof, warme Hallenstrahler | Gefahrgut-Schichtwechsel-Beacon |
| Nacht | 25 % | dunkel, nur Arbeitslicht + Notstrips; Oberlichter zeigen Sterne | **menschliche Stationen dunkel, Automaten laufen weiter** — der Layer „Menschen vs. Automatisierung" erzählt hier Lucas These von selbst |

### 5.6 Eingriffe des Besuchers und ihre Kausalketten

1. **AGV anhalten** (Klick/`E`): AGV hält, Warnlicht. → Nachfolger warten (Reservierung) → Loop-Puffer füllt sich → Packplatz hungert → LKW an Tor 4 wartet länger → HUD-Kennzahl „Verweilzeit" steigt. Loslassen → Aufhol-Welle sichtbar. *Das ist der Moment, in dem ein Recruiter versteht, was „Prozessanalyse" bedeutet.*
2. **Leitstand: Modus manuell ↔ Pipeline** (Konsole am Viewpoint 05): Die Quote-Pakete laufen sichtbar 3× schneller durch die Pipeline-Bahn; die bestehenden ROI-Slider (Angebote/Tag, Minuten/Angebot) steuern die tatsächlichen Raten der Simulation; Zähler „gesparte Stunden/Jahr" läuft mit. Immer mit „Modell"-Tag.
3. **Prüfstraße: Fehlerquote-Slider**: Mehr rote Pakete werden aufs Abstellgleis gestempelt („ABWEICHUNG"), der saubere Strom bleibt grün. Zähler: geprüft / abgelenkt / Papierstau: 0.
4. **LOG: Palette anfahren** (Klick auf eine der 5 Hash-Paletten): RBG fährt, Hub steigt, Palette kommt runter an die Präsentationsbühne → DOM-Panel mit dem Log-Eintrag öffnet sich. Danach lagert das RBG wieder ein.
5. **DOCK: Kontakt verladen** (Viewpoint 10): Drei Paletten — `mail`, `in`, `CV`. Klick → AGV lädt die Palette auf den wartenden LKW, Tor öffnet, LKW fährt mit GPS-Lichtlinie davon → die echte Aktion feuert (mailto / LinkedIn / CV-Download).

---

## 6. Look & Detailgrad (Referenz-Niveau)

- **Materialien:** `MeshStandardMaterial`/`MeshPhysicalMaterial` — roher Betonboden (leichte Rauheit, Fugen als Canvas-Textur), verzinkter Stahl für Regalrahmen, Holzpaletten, matte AGV-Körper mit Acid-Lichtleiste, Glasbalustrade an der Galerie. PMREM-Environment (prozedural generiert, kein HDR-Asset), `ACESFilmic`-Tonemapping — exakt das Referenz-Rezept.
- **Farbwelt = bestehendes Flightdeck:** Acid-Grün `#b4ff39` auf Ink `#0a0d0a` als Arbeitslicht/Daten, Cyan `#7dffd8` für Datenströme, **Amber `#ffb35c` als Palette-Break im Pausenraum** (direkt aus `themes[5/6]`). Die Halle fühlt sich an wie dieselbe Site, nur gebaut.
- **Licht:** 1 Directional Light (Sonne durch Oberlichter, Soft Shadows) + emissive Strips + wenige SpotLights in den Gängen. Max. 2 Schatten-werfende Lichter. Kein Bloom im MVP (Emissive + Tonemapping tragen), optional später.
- **Detail-Elemente, die den Detailgrad verkaufen** (alle prozedural, instanced): Regalrahmen mit Traversen und Durchschubsicherungen, Kabeltrassen unter dem Dach, Bodenmarkierungen (Fahrwege, Fußgängerstreifen, Nummern), ADR-Tafeln und Trennwand im Gefahrgut-Käfig, Schwerlast-Torprofile, Hubmast-Ketten am RBG, Holo-Beschriftungen (Canvas-Sprites) über den Zonen, blinkende Beacon am Käfig.
- **Title-Card** wie Referenz: `triangles / parts / fps` live (aus `renderer.info`) — das Signal „echtes Modell, kein Video".

---

## 7. Technik

### 7.1 Module (alle lazy, three.js bleibt aus dem Entry-Chunk)

```
src/scripts/halle/
  index.ts        // Entry (dynamic import aus main.ts, ersetzt flightdeck/flightworld-Pfad)
  scene.ts        // Renderer, PMREM, ACES, Resize, Qualitätsstufen
  geometry/
    shell.ts      // Boden, Wände, Dach, Oberlichter, Tore (merged)
    racks.ts      // Hochregal: InstancedMesh Stiele/Traversen
    conveyors.ts  // Förderloop, Prüfstraße, Weichen (merged + Kurven für Pakete)
    zones.ts      // Leitstand, Gefahrgut-Käfig, Mezzanine, Galerie, Pausenraum
    props.ts      // Paletten, Pakete, AGV-Bodies, RBG, LKW (alle instanced)
  sim/
    graph.ts      // Knoten/Kanten, A*, Blöcke
    agents.ts     // AGV/RBG/LKW State Machines + Reservierung
    orders.ts     // Auftragsgenerator, Queues, Schicht-Profile
    world.ts      // Fixed-Step-Loop (10 Hz), Zustand, Events → UI
  nav/
    tour.ts       // Scroll→Viewpoint-Spline (Nachfolger der CAM_KEYS-Logik)
    orbit.ts      // OrbitControls-Wrapper (ange dockt, Grenzen)
    walk.ts       // PointerLock-Walk, Kapsel-vs-AABB
    minimap.ts    // SVG-Grundriss, Live-Punkte
  ui/
    hud.ts        // bestehender HUD + Title-Card (tris/parts/fps)
    layers.ts     // Dach · Datenströme · Menschen/Automatisierung · Gefahrgut · Beschriftungen
    shift.ts      // Schicht-Slider Früh/Spät/Nacht
```

Erlaubte Imports aus `three/examples/jsm`: `OrbitControls`, `PointerLockControls`, `BufferGeometryUtils`, ggf. `RoomEnvironment` (PMREM). **Keine neuen npm-Dependencies nötig** — drei steht bei 0.186, das reicht. Physik, Pathfinding und Kollision sind ~200 Zeilen eigener Code, bewusst.

### 7.2 Budgets

| Budget | Ziel |
|---|---|
| Dreiecke sichtbar | ≤ 250 k (Regal ~140 k, Hülle ~8 k, Förderer ~15 k, Props ~50 k, Agenten ~10 k) |
| Draw Calls | ≤ 100 (Ziel ~60: Hülle 3, Regal 4, Paletten 2, Pakete 2, AGV 2, Förderer 3, Strips 1, Datenstrom 2, Holo-Labels ~12, Rest ~20) |
| Externe Assets | 0 (alles prozedural; Labels = Canvas-Texturen) |
| Schatten | 2 Lichter, Map ≤ 2048 |
| Hallen-Chunk | ≤ ~350 KB gz (three.js wird mit dem bestehenden Flightdeck-Chunk geteilt) |
| Zeit bis interaktiv | Cold Boot wartet wie heute max. 2,2 s auf `worldReady`; Halle baut Geometrie in < 500 ms |
| Desktop | 60 fps bei dpr ≤ 1,75 |

### 7.3 Qualitätsstufen (Auto-Detect + manuell)

Frame-Time-Messung über die ersten 2,5 s, dann automatische Stufe:
- **Q0:** dpr 1,75, volle Schatten, 8 AGVs, animierte Datenströme.
- **Q1:** dpr 1,25, Schatten 1024, Datenströme statisch.
- **Q2:** dpr 1,0, Schatten aus, 4 AGVs, Holo-Labels reduziert.

---

## 8. Was aus dem Bestand passiert

| Bestand | Schicksal |
|---|---|
| Cold Boot, Typewriter, `ls/whoami`-Egg | **bleibt** (Init-Zeilen angepasst) |
| HUD (Brand, Telemetrie, Station-Buttons, Audio-Toggle, EQ) | **bleibt**, Station-Buttons = Viewpoints, + Title-Card |
| Audio-Engine + Beat-Pulse | **bleibt**, klingt jetzt im Pausenraum (Raumlicht pulsiert) |
| Sequencer (`sequencer.ts`) | **bleibt** als DJ-Pult im Pausenraum (DOM-Panel unverändert) |
| Terminal (`terminal.ts`) | **bleibt** als Konsole auf der Galerie |
| ROI-Slider (`roi.ts`) | **migriert** in die Leitstand-Konsole (gleiche Mathematik, steuert jetzt die Sim) |
| Warehouse-Minigame (`warehouse.ts`) | **wird abgelöst** — das echte Hochregal mit RBG ersetzt das 4×3-Klick-Spiel |
| `flightworld.ts` (Korridor) | **wird abgelöst** durch `halle/` (Themes/Farben/Fade-Patterns werden übernommen) |
| `flightdeck.ts` (Scroll-Rig, Panels, Flashes) | **bleibt strukturell**, Spline + Keys werden Viewpoint-Tour |
| Station-Panels (Proof, Log, Work, Stack, Beyond, Contact) | **bleiben als DOM-Inhalte**, öffnen an ihren Zonen |
| Klassische Ansicht (shader-bg, hero, scrollfx) | **bleibt unangetastet** als Fallback |

---

## 9. Fallbacks (Hard Constraint, unverändert)

- Gating in `main.ts` bleibt exakt: `prefers-reduced-motion` → klassisch; `pointer: coarse` oder `< 1024 px` → klassisch; kein WebGL → klassisch. **Die klassische Ansicht bleibt voll funktionsfähig und unverändert.**
- **Mobile bekommt im MVP nichts Neues** — bewusste Entscheidung: Eine halbe Halle auf dem Handy ist schlechter als eine funktionierende klassische Seite. Optionaler späterer Task: statisches Hallen-Keyvisual + Viewpoint-Liste als reine DOM-Tour auf Mobile.
- Fällt der Hallen-Chunk beim Laden auf die Nase, greift der bestehende `classic()`-Pfad.

---

## 10. Build-Plan (Tasks à ~45 min)

| Task | Inhalt | Ergebnis |
|---|---|---|
| **T-101 MVP — „erster Flash"** | Hülle + Boden + Hochregal (instanced) + PMREM/ACES + 1 Schattenlicht + Power-up-Intro + Orbit + 4 Viewpoints (Galerie, Aerial, Regalgang, Kreuzung) + 3 AGVs auf Einbahn-Loop mit Reservierung + Title-Card (tris/parts/fps) | **Man fliegt in eine lebende Halle.** Alles Weitere ist Verdichtung. |
| T-102 Zonen-Geometrie | Leitstand, Förderloop, Prüfstraße, Gefahrgut-Käfig, Mezzanine, Galerie, Pausenraum + Minimap-SVG | Grundriss komplett begehbar |
| T-103 Sim-Kern | Aufträge, Queues, RBG, LKW, Puffer, Schicht-Profile, Fixed-Step | Halle läuft regelbasiert |
| T-104 Walk-Modus | PointerLock, WASD, Kapsel-Kollision, `E`-Interaktion, Tastaturkarte, Hilfe-Overlay | Begehbar wie Referenz, mehr |
| T-105 Inhalte | LOG-Paletten+RBG-Präsentation, Leitstand manuell/Pipeline + ROI-Migration, Prüfstraße-Slider, DOCK-Verladung, W3-GPS | Zonen erzählen Lucas Inhalte |
| T-106 Atmosphäre | Schicht-Slider, Layer-Toggles, Pausenraum (Sequencer/Audio), Datenstrom-Layer | Referenz-Feature-Parität + Mehrwert |
| T-107 Härtung | Qualitätsstufen, Perf-Messung, i18n DE/EN, A11y, Fallback-Verifikation, Checkliste AGENTS.md | Merge-fähig |
| T-108 (optional) | Mobile-Keyvisual/Tour | Nur nach Freigabe |

### Größte Risiken und Absicherung

1. **Ästhetik statt Technik ist das Risiko.** Triangle-/Draw-Call-Mathematik liegt weit unter Budget (Instancing ist Routine); ob die Halle „teuer" aussieht, entscheiden Licht, Power-up-Choreografie und Details. → Absicherung: MVP priorisiert genau diese drei Dinge vor Feature-Breite; Referenz-Rezept (PMREM, ACES, Physical Materials, Soft Shadows) wird 1:1 übernommen.
2. **Scope-Explosion der Sim.** → Absicherung: Harter Kern = 3 Entitäten (AGV, RBG, LKW) + 3 Auftragstypen; Stapler und Menschen sind explizit gestrichen; jede Zonen-Interaktion ist einzeln abschaltbar (Layer/Flags).
3. **Scroll-Tour ↔ freie Navigation-Konflikt.** → Absicherung: klare Zustandsmaschine (TOUR → DOCKED/ORBIT → WALK), Scroll gehört immer der Tour, Entscheidung in §4.2.
4. **PointerLock-Fricassee** (Browser-Einschränkungen, Esc-Handling). → Absicherung: Walk ist ein expliziter Opt-in-Modus, nie Pflicht; Orbit bleibt Default.

**Machbarkeits-Spike: entfällt (Entscheidung).** Die einzige offene technische Frage (Performance von Halle + ~10 Agenten) ist mit den Budgets in §7.2 rechnerisch unstrittig — ~250 k instanced Dreiecke und ~60 Draw Calls sind für drei@0.186 auf Desktop-GPUs Standardlast. Ein Spike würde Konzeptbudget verbrennen, ohne neue Information zu liefern. T-101 liefert die Messwerte (fps-Counter in der Title-Card) als Nebenprodukt.

---

## 11. Was Luca entscheiden sollte

1. **Name/Framing:** „DIE HALLE" als interner Arbeitstitel — auf der Site bleibt `STACH://FLIGHTDECK` als Brand, die Halle ist die Welt dahinter. Alternativ: `STACH://HALLE`.
2. **Scroll-Tour bleibt primärer Pfad** (Vorschlag §4.1) vs. komplett freie Navigation mit optionalem „Tour starten"-Button.
3. **MVP-Umfang T-101** so wie geschnitten, oder sollen Leitstand/Prüfstraße schon in den ersten Baustein?
