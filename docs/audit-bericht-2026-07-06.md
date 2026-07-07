<!-- Erzeugt am 2026-07-06 durch 3-Runden-Multi-Agent-Audit (PULS). Hinweis: Der Dedup-Schritt scheiterte am 64k-Output-Limit; Fallback auf un-deduplizierte Roh-Findings, daher koennen einzelne Punkte doppelt vorkommen. -->

# PULS — Audit-Bericht (Front-to-Back)

## Zusammenfassung

PULS ist funktional weit gediehen und im goldenen Pfad (erstellen → Folien → präsentieren → Handy stimmt ab → Ergebnisse live → Export) grundsätzlich tragfähig. Der 3-Runden-Audit hat aber eine dichte Schicht von „Kinderkrankheiten" freigelegt: stille Datenkorruption bei Ergebnissen, mehrere Layout-Brüche auf Handy und Beamer, durchgängig fehlende Fehler-/Ladezustände sowie eine Reihe echter Sicherheits- und Nebenläufigkeitslücken. Vieles davon ist harmlos im ruhigen Einzeltest, wird aber genau unter Demo-Bedingungen (Konferenz-WLAN, viele gleichzeitige Handys, Live-Publikum, projizierter Bildschirm) sichtbar.

**Zählung nach Schwere** (nach Entfernen von Doppelungen): **4 critical**, **37 high**, **54 medium**, **28 low**.

**Die 5 grössten Demo-Risiken entlang des goldenen Pfads:**

1. **Moderations-Warteschlange landet live auf dem Beamer** (critical): Noch nicht freigegebene Publikumsfragen inkl. Namen erscheinen im projizierten Vollbild — die Moderationsfunktion wird durch die eigene UI ausgehebelt. Katastrophal bei einer anstössigen Frage.
2. **Falsche Ergebniszahlen durch Options-Bearbeitung** (critical): Löschen/Leeren einer Antwortoption verschiebt indexbasierte Stimmen — die Balken zeigen live andere Werte, als abgestimmt wurde, ohne Fehler.
3. **Export scheitert an einem einzigen Zeichen** (critical): Ein Steuerzeichen in einer offenen Antwort macht die komplette XLSX-Datei unlesbar — genau beim Klick auf „Exportieren".
4. **Ungebremstes Brute-Force/Ballot-Stuffing** (critical): Keine Rate-Limits auf Beitritt/Abstimmen; jede Person kann Codes durchprobieren und live Spam in die projizierte Wortwolke/Q&A einschleusen oder Ergebnisse fluten.
5. **Sichtbar „kaputte" Kernanzeigen**: Der Teilnehmerzähler steht auf Vercel dauerhaft auf „0 Personen sind dabei" (high), Weiter/Zurück reagieren bis ~1,5 s verzögert ohne Feedback (high), die eigene führende Antwort zeigt keinen erkennbaren Ergebnisbalken (high), und lange (deutsche) Wörter sprengen Handy- wie Beamer-Layout (high).

Roter Faden: Der Client geht fast überall vom Erfolgsfall aus. Fehlende Fehler-/Lade-/Timeout-Behandlung, fehlende Doppel-Submit-Sperren und rein indexbasierte Ergebnis-/Positionslogik erzeugen zusammen ein Bild von Unfertigkeit, das in der Demo teuer wird.

---

## 🔴 Vor der Demo beheben (critical + high)

### Ergebnis-Integrität — Stimmen & Quiz (die gefährlichste Klasse)

**Löschen einer Antwortoption verschiebt bestehende Stimmen auf eine andere Option** — `Editor / Antwortoptionen` · `public/presenter.html:692`
- **Problem:** Stimmen werden serverseitig nur als numerischer Index in `slide.options` gespeichert. Der ×-Button entfernt eine Option per `splice(i,1)` ohne Prüfung; beim Autosave bleiben `prev.answers` unverändert. Alle nachfolgenden Indizes rutschen eine Position nach vorn.
- **Wirkung:** Löscht der Moderator eine mittlere/erste Option einer laufenden Abstimmung, erscheinen Stimmen bei der falschen Option bzw. fallen aus der Zählung — live sichtbarer, kaum erklärbarer Zahlendreher (betrifft choice, ranking, points, quiz).
- **Fix:** Bei relevanter Options-Änderung (Länge/Reihenfolge) `slide.answers` serverseitig leeren oder per Options-ID remappen; vorher warnen („Bestehende Stimmen werden zurückgesetzt").

**Leere/Whitespace-Option wird beim Autosave lautlos entfernt — Stimmen wandern** — `Editor / Antwortoptionen` · `lib/domain.mjs:34`
- **Problem:** `sanitizeSlide` filtert leere/getrimmte Optionen (`.filter(Boolean)`) ohne Löschaktion des Nutzers. Leert der Moderator eine bestehende mittlere Option versehentlich auf Leerzeichen, verschieben sich beim 600-ms-Autosave alle nachfolgenden Indizes — dieselbe Korruptionsklasse wie oben, aber ohne bewusste Löschung.
- **Wirkung:** Stimmen verschwinden oder werden falsch zugeordnet, ohne dass irgendein Löschen ausgelöst wurde — besonders tückisch, weil kein Warnhinweis existiert.
- **Fix:** Leere Optionszeilen nicht sofort `scheduleSave()` auslösen lassen bzw. vor dem Senden herausfiltern; langfristig Optionen über stabile IDs referenzieren.

**Folientyp-Wechsel übernimmt alte Antwortdaten als vermeintlich gültige Werte** — `Editor / Folientyp ändern` · `api/index.js:494`
- **Problem:** `PUT /slides` setzt `slide.answers = prev.answers` unabhängig von einem Typwechsel; `btnChangeType` fragt nicht nach. Aus einer choice-Stimme `[1]` wird `Number([1])===1` und zählt in einer Skala 1–5 als echte Bewertung.
- **Wirkung:** Spontaner Typwechsel (z. B. Multiple Choice → Skala) zeigt sofort scheinbar echte, aber sinnlose Ergebnisse — wirkt unseriös, wenn es live passiert.
- **Fix:** Bei Typwechsel `slide.answers = {}` setzen; bei vorhandenen Stimmen vorher bestätigen lassen.

**Löschen der als richtig markierten Quiz-Option springt unbemerkt auf Option 1** — `Export / Quiz` · `public/presenter.html:696`
- **Problem:** Wird die aktuell korrekte Option gelöscht, setzt der Handler `s.correct = 0` still, ohne Dialog. Der neue (falsche) Wert fliesst in Live-Wertung, Rangliste, XLSX-Haken und PPTX-Grün-Markierung.
- **Wirkung:** Beim Aufräumen wird plötzlich eine andere Antwort als „richtig" gewertet und gepunktet — im Export erscheint demonstrativ die falsche Option mit grünem Haken.
- **Fix:** Beim Löschen der korrekten Option aktiv zur Neu-Auswahl auffordern statt still auf Index 0 zu fallen; alternativ `correct = null` und deutlich kennzeichnen.

**Ändern des Quiz-Antwortschlüssels während laufender Abstimmung entkoppelt Rangliste von der angezeigten „richtigen" Antwort** — `Domänenlogik / Quiz` · `lib/domain.mjs:300`
- **Problem:** `applyAnswer()` friert `correct`/`points` je Teilnehmer beim Abstimmen ein; `computeResults()`/Export lesen dagegen live `slide.correct`. Ein Schlüsselwechsel per `PUT /slides` lässt beide auseinanderlaufen.
- **Wirkung:** Rangliste (alte Punkte) und angezeigte „richtige Antwort" (neuer Schlüssel) widersprechen sich dauerhaft und unbemerkt — im Export nicht mehr rekonstruierbar.
- **Fix:** Änderungen an `correct` bei bereits vorhandenen Antworten serverseitig ablehnen (oder nur nach explizitem Reset erlauben) und im Editor warnen.

**Quiz verspricht „Die Auflösung folgt gleich" — sie wird dem Teilnehmenden nie gezeigt** — `Publikum / Quiz` · `public/common.js:308`
- **Problem:** Der öffentliche Snapshot liefert bewusst `results.correct = -1` (Anti-Cheat); `vote.html` übergibt beim Quiz-Ergebnis nie einen `correctIndex`. Der Haken bei der richtigen Antwort bleibt auf dem Handy strukturell immer aus — im Self-Paced-Modus fehlt sogar die Bühnenansicht als Ersatz.
- **Wirkung:** Wer falsch geantwortet hat, wartet vergeblich auf die versprochene Auflösung auf dem eigenen Gerät — fällt sofort auf, sobald jemand Handy und Leinwand vergleicht.
- **Fix:** Copy anpassen („Die Auflösung siehst du auf der Bühne") oder den Korrekt-Index nach Freigabe kontrolliert auch ans Publikum durchreichen.

### Präsentationsmodus & Live-Steuerung

**Q&A-Moderationswarteschlange wird auf der projizierten Bühne selbst angezeigt** — `Präsentationsmodus / Q&A` · `public/presenter.html:229` · *(critical, security)*
- **Problem:** `#moderationPanel` (Klartext der NICHT freigegebenen Fragen samt Namen) ist Kind von `#presentMode` und wird als `position:fixed`-Overlay im selben Vollbild gerendert, das per `requestFullscreen()` auf den Beamer geht. Ein zweiter Presenter-Screen existiert nicht.
- **Wirkung:** Beim Standard-Ein-Bildschirm-Setup (Spiegelung) sieht das Publikum ungeprüfte Fragen, bevor der Moderator sie freigibt/verwirft — die Schutzfunktion versagt in der Praxis komplett.
- **Fix:** Moderationspanel nur in einer separaten Presenter-Ansicht (zweites Fenster) zeigen oder per nicht-projizierbarem Tastenkürzel ein-/ausblendbar machen; bei Vollbild deutlich warnen.

**Q&A-Freigabe-Panel bleibt nach Verlassen der Beitritts-Bühne leer** — `Präsentationsmodus / Q&A` · `public/presenter.html:1120`
- **Problem:** `refreshModeration()` bricht ab, solange `joinStage` true ist; `showSlides()` ruft danach nur `applyStagePresence()` auf, nie erneut `refreshModeration()`/`renderPresent()`. Auf SSE (Hetzner) kommt der nächste echte Snapshot erst bei einer Zustandsänderung — der Heartbeat löst kein `onmessage` aus.
- **Wirkung:** Beim Standardübergang Bühne → erste Folie kann eine längst wartende Publikumsfrage unsichtbar bleiben; das Panel wirkt defekt.
- **Fix:** In `showSlides()`/`showJoinStage()` nach `applyStagePresence()` zusätzlich `refreshModeration(lastSnapshot)`/`renderPresent(lastSnapshot)` aufrufen.

**Kein sofortiges Feedback nach Weiter/Zurück/Sperren/Ausblenden — Anzeige hängt am Poll-Intervall** — `Präsentationsmodus / Steuerung` · `public/presenter.html:1039`
- **Problem:** `navigate()`/`setState()` posten nur; kein optimistisches Update, kein Sofort-Refetch. Auf Vercel (kein SSE) aktualisiert sich die Anzeige erst beim nächsten Poll-Tick (`POLL_INTERVAL_MS=1500`).
- **Wirkung:** Die Projektion reagiert auf die meistgenutzten Steuer-Klicks mit bis zu ~1,5 s Verzögerung ohne Pending-Anzeige — wirkt wie ein hängendes System. Zusätzlich verschluckt ein Doppelklick auf „Weiter" (beide berechnen `activeIndex+1` aus dem veralteten Snapshot) den zweiten Klick.
- **Fix:** Nach `setState()`/`navigate()` sofort Snapshot nachladen oder optimistisch aktualisieren; kurzen Pending-Zustand am Button zeigen.

**Teilnehmerzähler zeigt auf Vercel dauerhaft „0 Personen" — auch auf der Beitritts-Bühne** — `Präsentationsmodus / Beitritts-Bühne` · `api/index.js:173`
- **Problem:** `snapshot()` liefert serverlos hart `audience: 0`. Dieser Wert speist die Dauer-Leiste und die grosse Beitritts-Bühne mit QR-Code.
- **Wirkung:** Zuschauer scannen und stimmen sichtbar ab, der grosse Zähler bleibt bei „0 Personen sind schon dabei" — wirkt wie ein defektes Kernfeature.
- **Fix:** Zahl aus einem echten Redis-Set (Geräte-IDs mit TTL) ableiten oder den Zähler serverlos ausblenden statt Falschangabe.

**„Präsentieren" geht bei Netzwerk-Verzögerung nicht wirklich ins Vollbild — Admin-Token in der URL bleibt sichtbar** — `Präsentationsmodus / Übergang` · `public/presenter.html:993`
- **Problem:** `enterPresent()` ruft vor `requestFullscreen()` ein `await saveNow()` (Netzwerk-Request). Die kurze Nutzeraktivierungs-Frist läuft ab; `requestFullscreen()` wird abgelehnt (Safari praktisch immer) und mit `.catch(()=>{})` verschluckt. Die CSS-„Fake-Fullscreen"-Overlay täuscht Erfolg vor.
- **Wirkung:** Der Wow-Moment schlägt still fehl: Browser-Leiste (mit Klartext-Admin-Token) bleibt sichtbar auf dem geteilten Bildschirm.
- **Fix:** `requestFullscreen()` synchron im Klick-Handler aufrufen (vor jedem await), Speichern parallel/danach; Fehlschlag mit sichtbarem „Vollbild aktivieren"-Button behandeln.

**„Präsentieren" startet auch bei gerade fehlgeschlagenem Autosave** — `Präsentationsmodus / Live-Start` · `public/presenter.html:993`
- **Problem:** `saveNow()` fängt jeden Fehler ab und setzt nur `lastSaveState='failed'`; `enterPresent()` prüft das nicht und schaltet in jedem Fall live.
- **Wirkung:** Moderator sieht neue Änderungen (lokal), Publikum bezieht den alten Serverstand — sichtbarer Auseinanderlauf zwischen Bühne und Editor, ohne Warnung.
- **Fix:** `saveNow()` Erfolg/Misserfolg zurückgeben lassen; bei Fehlschlag mit Rückfrage anhalten („Änderungen nicht gespeichert — trotzdem präsentieren?").

**Reset-Aktionen („Antworten zurücksetzen") haben keinerlei Fehlerbehandlung** — `Präsentationsmodus / Datenverwaltung` · `public/presenter.html:954`
- **Problem:** Die einzigen beiden `await api(...)`-Aufrufe im File ohne try/catch (anders als „Archivieren"). Schlägt der Reset fehl (Token, Netz, 500), bleibt nur ein unbehandelter Promise-Fehler.
- **Wirkung:** Nach dem Bestätigen-Dialog sieht der Moderator keine Rückmeldung und glaubt, Testdaten seien gelöscht — die Bühne zeigt dann eine peinliche Mischung aus Test- und echten Antworten.
- **Fix:** Beide Handler wie „Archivieren" in try/catch fassen, `alertDialog` bei Fehler zeigen und frischen Snapshot anstossen.

**In Selbststeuerung wirken „Ergebnisse ausblenden"/„Abstimmung sperren" global für ALLE Folien** — `Präsentationsmodus / Self-Paced` · `api/index.js:179`
- **Problem:** `resultsHidden`/`votingLocked` sind pro Präsentation je genau ein Boolean, nicht pro Folie. Im Self-Paced-Zweig setzt `snapshot()` `resultsList` komplett auf null; `vote.html` sperrt jede Folie, auf der jemand gerade steht.
- **Wirkung:** Der Moderator bedient seine Bühne, entzieht damit aber allen unabhängig blätternden Teilnehmenden auf völlig anderen Folien Ergebnisse/Abstimmung — wirkt wie ein Zufalls-Aussetzer.
- **Fix:** `resultsHidden`/`votingLocked` pro Folie (oder für Self-Paced getrennt vom bühnengebundenen State) speichern.

**activeIndex ist nur ein Array-Index — Folien bearbeiten während der Präsentation springt das Publikum auf eine andere Folie** — `API/Backend / Live-Bearbeitung` · `api/index.js:502`
- **Problem:** Beim `PUT /slides` wird `activeIndex` nur auf die neue Array-Länge geklemmt, nicht an die ID der zuvor aktiven Folie gebunden. Umsortieren/Löschen/Einfügen während der Sitzung lässt denselben Index eine andere Folie treffen.
- **Wirkung:** Ohne „Weiter"/„Zurück" sieht das Publikum plötzlich eine andere Frage — wirkt wie ein kaputter Präsentationsmodus.
- **Fix:** `activeIndex` beim Speichern über die Folien-ID der zuvor aktiven Folie neu auflösen.

### Publikum / Abstimmung — Robustheit

**Stimmabgabe schlägt bei vier Folientypen komplett lautlos fehl (kein onErr)** — `Publikum / Abstimmen` · `public/vote.html:432`
- **Problem:** `submit(value, onOk, onErr)` wird in `buildChoiceMulti`, `buildWordcloud`, `buildPoints` und `buildRanking` ohne dritten Parameter aufgerufen. Im Fehlerfall passiert nichts — nicht einmal `console.error`.
- **Wirkung:** Bei 423 (gesperrt), 429 (Folie voll) oder Netz-Timeout verschwindet die Stimme kommentarlos; Mehrfachauswahl, 100-Punkte, Ranking, Wortwolke verlieren still ihre Eingabe. Der Moderator erklärt sich eine unerklärlich niedrige Beteiligung.
- **Fix:** In allen vier Aufrufen einen `onErr`-Handler ergänzen (sichtbarer Fehler + optimistischen Zustand zurücksetzen); in `submit()` ein `console.error` für unbehandelte Fehler.

**Blockierter/deaktivierter localStorage lässt vote.html beim Laden abstürzen** — `Publikum / Abstimmen` · `public/vote.html:48`
- **Problem:** `const PID = participantId();` läuft ungeschützt auf oberster Skriptebene; `participantId()` greift ohne try/catch auf `localStorage` zu. Bei blockiertem Storage (Safari „Alle Cookies blockieren", MDM-Profile, Privacy-Erweiterungen) bricht das ganze `<script>` ab, bevor `init()` läuft.
- **Wirkung:** Betroffene sehen dauerhaft nur „Verbinde …" mit Spinner — kein Fehlertext, kein Ausweg. Beitritt ist für strikte Datenschutz-Setups komplett und lautlos unmöglich.
- **Fix:** `participantId()` defensiv machen (try/catch, In-Memory-Fallback pro Tab) und den Fehlerfall im UI sichtbar machen.

**Gelöschte/abgelaufene Sitzung (404) wird nicht von einem Netz-Hänger unterschieden — Bühne und Moderator frieren lautlos ein** — `Fehlerbehandlung` · `public/common.js:62`
- **Problem:** Die Polling-Schleife behandelt jeden Fehler identisch (`catch { onStatus('reconnect') }`) — permanentes 404 wie kurzer Ausfall; es wird ewig alle 1,5 s weiterversucht. Weder `presenter.html` noch `vote.html` übergeben überhaupt einen `onStatus`-Callback.
- **Wirkung:** Verschwindet die Präsentation mitten in der Sitzung, frieren Publikums- UND Moderatoransicht lautlos auf dem letzten Snapshot ein — auch ein Reload würde nichts retten, aber niemand erfährt es.
- **Fix:** 404 explizit (`err.status`) von Netzfehlern trennen, einen `onStatus('gone')`-Zustand auslösen und in beiden Seiten eine klare, permanente Meldung mit Link zur Startseite zeigen.

**bfcache friert defekten „joining"-Guard ein — Beitreten nach Zurück-Button dauerhaft tot** — `Onboarding / Beitritt` · `public/index.html:91`
- **Problem:** `joining` wird vor dem API-Call auf true gesetzt, im Erfolgsfall aber nie zurückgesetzt (Verlass auf Full-Reload durch `location.href`). Kommt `index.html` per Zurück-Button aus dem bfcache (Safari sehr aggressiv), bleibt `joining=true` — jeder weitere Beitritt bricht still an `if (joining) return;` ab.
- **Wirkung:** Wer einer falschen Sitzung beitritt und per Zurück korrigieren will, landet in stiller Sackgasse ohne Fehlermeldung — sieht aus wie ein App-Absturz.
- **Fix:** `joining` beim Erfolg zurücksetzen UND einen `pageshow`-Listener registrieren, der bei `event.persisted` alle Formular-/Guard-Zustände resettet.

**Kein beforeunload-Schutz: Tab schliessen/Reload direkt nach einer Änderung verwirft sie lautlos** — `Editor / Autosave-Timing` · `public/presenter.html:512`
- **Problem:** `scheduleSave()` debounced 600 ms; es existiert kein `beforeunload`/`pagehide`/`sendBeacon`-Flush. Änderungen der letzten ~600 ms vor Tab-Close/Reload/Navigation gehen verloren — unabhängig vom Fehlerfall.
- **Wirkung:** Frage tippen, sofort Logo klicken/Tab schliessen → letzte Änderung weg, ohne dass je „Gespeichert" erschien.
- **Fix:** Bei `pagehide`/`beforeunload` ausstehende Änderungen per `navigator.sendBeacon` flushen und/oder native Verlassen-Warnung zeigen, solange `saveTimer` läuft.

**Fehlgeschlagenes Autosave wird nur durch unauffälligen Text markiert** — `Editor / Autosave` · `public/presenter.html:522`
- **Problem:** `saveNow()` fängt Fehler nur ab (`lastSaveState='failed'`, kleines graues Textlabel), kein Retry, kein `beforeunload`-Schutz. Die Fehlerfarbe ist optisch nicht von „Speichert …" zu unterscheiden.
- **Wirkung:** Bei kurzem WLAN-Hänger merkt der Moderator nichts; schliesst er den Tab, sind alle Änderungen seit dem letzten Erfolg weg.
- **Fix:** Automatischer Retry mit Backoff, deutlich sichtbares Fehler-Banner statt Mini-Label, plus `beforeunload`-Bestätigung bei `failed`.

**Zwei offene Editor-Tabs überschreiben sich gegenseitig komplett (kein Konfliktschutz trotz Lock)** — `Editor / Nebenläufigkeit` · `api/index.js:488`
- **Problem:** `PUT /slides` ersetzt jedes Mal das komplette `slides`-Array durch das des Clients. `withPresLock` serialisiert nur, prüft aber keine Version/`updatedAt` gegen den zuletzt geladenen Stand.
- **Wirkung:** Zwei Tabs (Doppelklick, „in neuem Tab öffnen", Laptop+Tablet) → der zuletzt speichernde gewinnt, Änderungen des anderen verschwinden kommentarlos.
- **Fix:** Versionsnummer/`updatedAt` mitführen; Server lehnt veraltete `PUT`s mit 409 ab, Editor fordert zum Neuladen/Zusammenführen auf.

### Layout / Darstellung — Handy & Beamer

**Lange, leerzeichenlose Wörter sprengen die Abstimmungsseite horizontal (Frage & Wortwolke)** — `Publikum / Wortwolke & Fragetext` · `public/app.css:254`
- **Problem:** `.vote-question` und `.cloud-word` besitzen als einzige Textcontainer kein `overflow-wrap`/`word-break`. Live gemessen (320 px): eine Frage mit einem langen Wort treibt `scrollWidth` auf 485 px; zwei gleiche 41-Zeichen-Begriffe (56 px Schrift) auf 723 px.
- **Wirkung:** Wortwolken sind ein Kern-Showcase — jeder Teilnehmer kann mit einem normalen deutschen Kompositum/Hashtag/URL die Live-Anzeige für alle zerschiessen (horizontales Scrollen, abgeschnittener Text).
- **Fix:** `overflow-wrap: anywhere;` auf `.vote-question` und `.cloud-word`; bei der Wortwolke zusätzlich max. Schriftgröße relativ zur Containerbreite.

**Derselbe Fehler reisst auch den Editor auf Tablet-/Handy-Breite auseinander** — `Editor / Folienbearbeitung` · `public/app.css:102`
- **Problem:** `.editor-layout` ist ein Grid ohne `min-width:0` auf den Grid-Items. Ein langes Wort im Fragefeld erzwingt Wortbreite statt 100 %. Live: 768 px → 1095 px Inhaltsbreite, alle Karten (inkl. QR-Code) laufen über.
- **Wirkung:** Auch der Moderator verliert die Kontrolle über seine Oberfläche, sobald er von Tablet/Handy/schmalem Fenster arbeitet — realistisch beim Nachjustieren während der Demo.
- **Fix:** `min-width: 0` auf die drei Grid-Items in `.editor-layout`; `overflow-wrap` für lange Formularfeld-Werte generell absichern.

**Ergebnis-Füllung kollidiert mit „ausgewählt"-Farbe bei Choice und Skala** — `Publikum / Ergebnis-Darstellung` · `public/app.css:574`
- **Problem:** `.selected` bleibt nach dem Abstimmen erhalten; die Result-Füllung liegt darüber. Bei Choice ist die Füllfarbe der eigenen führenden Antwort (`--surface-alt`) identisch mit der Selected-Fläche → Balken unsichtbar. Bei Skala schimmert oberhalb der Füllung die volle `.selected`-Markenfarbe durch → zweifarbiger Blockrest.
- **Wirkung:** Genau der wahrscheinlichste Live-Fall (man stimmt für die führende Antwort/einen Skalenwert) zeigt keinen erkennbaren Balken bzw. wirkt kaputt — untergräbt „Ergebnisse erscheinen live und nachvollziehbar" im Blickmoment.
- **Fix:** Beim Wechsel in die Ergebnisansicht `selected` entfernen, bevor `as-bar`/`own`/`leader` gesetzt werden; „eigene Wahl" nur über Rahmen/Outline markieren.

**Lange Optionstexte zerreissen die Balkendiagramm-Ausrichtung** — `Ergebnis-Darstellung / Beamer` · `public/app.css:390`
- **Problem:** `.bar-row` ist ein Grid mit `align-items:center`, `.bar-label` erlaubt beliebigen Umbruch ohne Zeilenlimit (Optionstext bis 120 Zeichen). Ein längeres Label wächst auf 5–6 Zeilen, Balken/Zahl bleiben zentriert; im Präsentationsmodus ist die Schrift zusätzlich hochskaliert.
- **Wirkung:** Der Balken „schwebt" in leerer Fläche, die Folgezeile mit kurzem Label wirkt kompakt — der Chart sieht auf dem Beamer zerrissen und unprofessionell aus (betrifft Choice, Quiz, Punkte).
- **Fix:** Label auf 2 Zeilen begrenzen (line-clamp + Tooltip) oder `align-items:start` und Balken/Wert an der ersten Zeile ausrichten.

**Sticky Bestätigen-Leiste hat keine Vorkehrung gegen die mobile Bildschirmtastatur** — `Publikum / Eingabe` · `public/app.css:551`
- **Problem:** Die Bestätigen-Leiste ist `position:sticky; bottom:0` ohne jedes `visualViewport`-Handling (0 Treffer im Code). Bei fokussiertem Eingabefeld schrumpft in iOS Safari nur der visuelle Viewport — die Leiste landet hinter der Tastatur.
- **Wirkung:** Bei offener Frage/Q&A/Wortwolke kann das Absenden auf iPhones blockiert wirken, bis die Tastatur manuell geschlossen wird — genau der geforderte „Tastatur überdeckt Button"-Fall.
- **Fix:** Auf `position:fixed` umstellen und per `visualViewport`-Resize-Listener aktiv positionieren; `padding-bottom: env(safe-area-inset-bottom)` ergänzen.

### Barrierefreiheit

**Dialoge fangen den Tastaturfokus nicht ein — Fokus verschwindet hinter dem Overlay** — `Barrierefreiheit / Dialoge` · `public/presenter.html:781`
- **Problem:** `confirmDialog`/`alertDialog`, `openTypeGallery` (presenter.html) und `openSecureDialog` (index.html) setzen `aria-modal`, haben aber keinen Fokus-Trap; die beiden zuletzt genannten setzen gar keinen Initialfokus. Hintergrund wird nicht `inert`.
- **Wirkung:** Tastatur-/Screenreader-Nutzer verlieren die Orientierung: Tab springt gar nicht in den Dialog oder aus ihm heraus in verdeckte Hintergrund-Buttons — bei einer a11y-geprüften Demo wirkt die App kaputt.
- **Fix:** Beim Öffnen erstes interaktives Element fokussieren, Tab/Shift+Tab zyklisch im Dialog halten, beim Schliessen Fokus zum Auslöser zurückgeben.

**„Abstimmung gesperrt"-Hinweis hat nur 1,95:1 Kontrast — praktisch unsichtbar** — `Publikum / Sperr-Status` · `public/app.css:558`
- **Problem:** `.vote-lock-chip` setzt `color:var(--warning)` (#E4A911) auf `--warning-bg` (#FDF6E3) ≈ 1,95:1 (AA verlangt 4,5:1). Der Badge-Stil im Design-System nutzt bewusst die dunklere Bronze-Farbe — der Chip nicht.
- **Wirkung:** Sperrt die Moderation die Abstimmung, sehen Sehbehinderte/Nutzer mit hellem Display den Hinweis kaum und tippen weiter auf eine gesperrte Folie.
- **Fix:** Dunklere Textfarbe (Bronze/Grey-6) auf dem hellen Warn-Hintergrund, sodass ≥ 4,5:1 erreicht wird.

### Export & i18n

**Steuerzeichen in Freitext-Antworten zerstören die exportierte XLSX-Datei** — `Export / XLSX` · `lib/domain.mjs:480` · *(critical)*
- **Problem:** `xmlEsc()` escaped nur `&<>"'`, `clampText()` filtert nur Länge — XML-1.0-unzulässige Steuerzeichen (`\x01`, `\x0B`, z. B. aus PDF/Terminal-Copy-Paste) landen ungefiltert in `sheetX.xml`. End-to-End reproduziert: openpyxl lehnt die GESAMTE Arbeitsmappe ab (auch unbeteiligte Folien). Endpunkt ist unauthentifiziert.
- **Wirkung:** Ein einziger Teilnehmer macht mit einem Zeichen die komplette .xlsx unlesbar — genau beim Demo-Klick auf „Ergebnisse exportieren", ohne Recovery-Pfad im UI.
- **Fix:** In `clampText()` alle Zeichen ausser `\t\n\r` und druckbarem Unicode per Regex entfernen; Test mit Steuerzeichen in die Suite.

**Excel- und PowerPoint-Export sind immer Deutsch — ignorieren die UI-Sprache** — `Export / i18n` · `public/pptx-export.js:30`
- **Problem:** Weder `pptx-export.js` noch `lib/domain.mjs`-Export rufen `t()/getLang()`; alle Beschriftungen (TYPE_LABEL, „Folie", „Frage", „Stimmen", „Teilnehmende", „Übersicht", „Rangliste" …) sind deutsche Literale.
- **Wirkung:** Nach Sprachwechsel auf Englisch liefert der wichtigste Investoren-Artefakt (der mitnehmbare Report) eine komplett deutsche Datei — sichtbarer Bruch der beworbenen Zweisprachigkeit.
- **Fix:** Label-Strings in Locale-Wörterbücher auslagern und die aktuelle Sprache an `buildPulsPptx()`/`exportWorkbook()` mitgeben.

**Skala-Standardbeschriftungen sind hartcodiert Deutsch — unabhängig von der UI-Sprache** — `Editor / Skala` · `lib/domain.mjs:46`
- **Problem:** Lässt der Moderator die Endpunkt-Labels leer, speichert `sanitizeSlide` die deutschen Texte „trifft nicht zu"/„trifft voll zu" als Datenwert der Folie (nicht nur als Placeholder). `vote.html` gibt sie unverändert aus.
- **Wirkung:** Bei englischer Demo zeigt jede Skala-Folie ohne eigene Labels (der Normalfall) deutschen Text auf Bühne und Handy — mitten in sonst englischer UI.
- **Fix:** Keine sprachspezifischen Fallback-Texte in die Daten schreiben; leer lassen und den Default rein clientseitig je UI-Sprache rendern (in beiden Runtimes).

**PPTX behauptet „weitere Antworten in der Excel-Datei" — die dort wegen derselben Kappung ebenfalls fehlen** — `Export / Datenintegrität` · `lib/domain.mjs:143`
- **Problem:** `computeResults()` kappt offene Antworten bei 200 und Q&A bei 100, BEVOR PPTX und XLSX darauf zugreifen. Der PPTX-Hinweis „… weitere in der Excel-Datei" bezieht sich auf eine Liste, in der die „weiteren" gar nicht mehr enthalten sind.
- **Wirkung:** Bei gut besuchten Sessions (>200 offene Antworten / >100 Fragen — der Showcase-Fall) verschwinden ältere Beiträge aus BEIDEN Exporten, während der Text fälschlich Vollständigkeit verspricht.
- **Fix:** Kappung im XLSX-Export aufheben (keine Layout-Zwänge) oder sichtbare Warnzeile ergänzen; PPTX-Hinweistext präzisieren.

**server.js dupliziert die komplette Ergebnis-/Export-/Domänenlogik statt lib/domain.mjs zu importieren** — `Export / Architektur` · `server.js:934` *(zusammengefasst mit dem zweiten, gleichlautenden Fund)*
- **Problem:** `lib/domain.mjs` bezeichnet sich als einzige Quelle; `api/index.js` importiert daraus, `server.js` aber nirgends — es hält 1:1-Kopien von `computeResults`, `applyAnswer`, `sanitizeSlide`, `exportWorkbook`, `leaderboard`, ZIP/XLSX-Helfern usw. Erste Kommentar-Abweichungen zeigen bereits beginnende Divergenz.
- **Wirkung:** Jede künftige Korrektur (v. a. Sicherheits-/Validierungs-Fixes) an der vermeintlichen einzigen Quelle erreicht nur Vercel; die Hetzner-Instanz zeigt still andere/veraltete Ergebnisse und Exporte.
- **Fix:** `server.js` auf `import` aus `lib/domain.mjs` umstellen und Duplikate entfernen (`package.json` ist bereits `type: module`). Bis dahin CI-Test auf inhaltliche Übereinstimmung.

**Datenschutzhinweis beschreibt nur die Vercel/Upstash-Variante — falsch für Self-Hosted** — `Datenschutz` · `public/datenschutz.html:62` · *(content)*
- **Problem:** Der Abschnitt „Speicherort und Speicherdauer" nennt pauschal „Upstash … Region Frankfurt" und „Vercel" als einzige Auftragsverarbeiter. Die Self-Hosting-Variante (`server.js`, JSON-Datei-Store) liefert dieselbe statische Datei aus — ohne Redis/Vercel/garantierte Region.
- **Wirkung:** Self-hosted betrieben zeigt die Datenschutzseite sachlich falsche Angaben zu Verarbeitern, Standort und Technologie — Compliance-Problem, falls „Self-Hosted-Option" vorgeführt wird.
- **Fix:** Speicherort-Abschnitt je nach Runtime dynamisch rendern (Server liefert Flag) oder zwei Textvarianten pflegen und beim Deployment die passende einsetzen.

### Sicherheit & Nebenläufigkeit

**Keine Rate-Begrenzung auf Beitritts-Code und Abstimmungs-Endpunkten — Brute-Force & Ballot-Stuffing live vor Publikum** — `API/Backend / Sicherheit` · `api/index.js:256` · *(critical, security)*
- **Problem:** `GET /join/:code`, `POST .../answers|react|upvote|identify` prüfen weder IP noch Frequenz (nur die Erstellung ist limitiert). 900.000 Codes sind durchprobierbar; `participantId` ist frei wählbar.
- **Wirkung:** Jede Person mit Internetzugriff kann (ohne den Code zu kennen) fremde laufende Sitzungen finden und live Spam/anstössige Wörter/Fragen in die projizierte Wortwolke/Q&A einschleusen oder den 5000er-Cap killen (echte Teilnehmer ausgesperrt).
- **Fix:** Sliding-Window-Limit pro IP (und pro Präsentation) für `/join`, `/answers`, `/react`, `/upvote`, `/identify` (Redis INCR+EXPIRE); harte Obergrenze neuer participantIds pro Minute/Slide.

**Teilnehmer-ID frei wählbar — Abstimmungen beliebig oft fälschbar (Ballot-Stuffing)** — `API/Backend / Datenintegrität` · `api/index.js:297` · *(security)*
- **Problem:** `participantId` kommt ungeprüft aus dem Client (nur 64-Zeichen-Clamp) und ist der einzige „schon abgestimmt"-Schlüssel — keine Kopplung an IP/Device/Session-Token, kein Rate-Limit.
- **Wirkung:** Mit ein paar Zeilen Code lassen sich Multiple-Choice, Wortwolke, Punkte, Ranking und v. a. die Quiz-Rangliste beliebig manipulieren — untergräbt das Kernversprechen „echte Live-Abstimmung".
- **Fix:** Beim `/join` signierten Teilnehmer-Token ausstellen, den `/answers`/`/upvote`/`/identify` validieren; zusätzlich IP-Rate-Limiting.

**Admin-Token ist ein für immer gültiges Bearer-Credential ohne Rotation/Widerruf** — `API/Backend / Auth` · `public/index.html:224` · *(security)*
- **Problem:** Der `adminToken` wird nur einmal bei Erstellung ausgegeben, dauerhaft in `localStorage` gespeichert und als klickbarer Link-Parameter gerendert. Es gibt keinen Rotate-/Revoke-Endpunkt — die einzige Neutralisierung ist das komplette Löschen der Präsentation.
- **Wirkung:** Einmal sichtbar (Bildschirmfreigabe, Verlauf-Sync, weitergeleiteter Link), erhält jeder Empfänger dauerhaft volle Kontrolle (Folien ändern, zurücksetzen, löschen) — ohne dass der Besitzer es merken/rückgängig machen kann.
- **Fix:** Rotate-Endpunkt („Link zurückziehen") ergänzen (alten Token sofort invalidieren); Reauth/Ablauf für sicherheitskritische Aktionen erwägen.

**Admin-Token im Klartext in der Export-Link-URL** — `Export / Datenschutz` · `public/presenter.html:395` · *(security; zusammengefasst mit dem zweiten, gleichlautenden Fund)*
- **Problem:** Der XLSX-Button verlinkt direkt auf `…/export.xlsx?token=<ADMIN_TOKEN>`; `requireAdmin()` akzeptiert das Token gleichwertig per Query. Der harmlos wirkende „Ergebnis-Download-Link" trägt damit das volle Master-Token — sichtbar im DOM, Browser-Verlauf, Download-Manager, Proxy-/Mail-Logs.
- **Wirkung:** Wer den Download-Link teilt, gibt ungewollt vollen Admin-Zugriff (inkl. Löschen/Manipulieren) auf die Präsentation für die gesamte TTL weiter.
- **Fix:** Export per POST mit Header-Token + Blob-Download auslösen, oder ein kurzlebiges, schreibgeschütztes Download-Token ausstellen; Query-Token-Auth abschaffen.

**Create-Rate-Limit per gefälschtem X-Forwarded-For umgehbar — kombiniert mit LRU-Verdrängung kann die Demo-Präsentation verschwinden** — `API/Backend / Rate-Limiting` · `server.js:76` · *(security)*
- **Problem:** `clientIp()` nimmt das ERSTE XFF-Element; nginx (`$proxy_add_x_forwarded_for`) hängt die echte IP aber ans ENDE an. Der Angreifer steuert damit die als „IP" gewertete Adresse und umgeht das 30/h-Limit beliebig. Auf Hetzner greift dann die LRU-Verdrängung nach `lastActivity` bei `MAX_PRESENTATIONS=2000`.
- **Wirkung:** Spam-Präsentationen mit frischer `lastActivity` verdrängen die ältesten, inaktivsten — z. B. eine im Voraus vorbereitete Demo-Präsentation, die kurz vor dem Pitch verschwindet. Auf Vercel: unbegrenztes Wachstum bis Code-Raum-Erschöpfung.
- **Fix:** Letzten (vom eigenen Proxy gesetzten) XFF-Eintrag verwenden bzw. Trusted-Hops konfigurierbar machen; LRU-Verdrängung mit Schutz für kürzlich aktive Präsentationen.

**Lock-Notausgang führt bei echter Gleichzeitigkeit zu Stimmenverlust** — `API/Backend / Nebenläufigkeit` · `api/index.js:127`
- **Problem:** `withPresLock` versucht 14× (~1 s) das Redis-Lock; scheitert das, läuft `fn()` komplett ungeschützt. `putPres()` überschreibt den ganzen Präsentations-Blob (Read-Modify-Write ohne atomare Redis-Ops).
- **Wirkung:** Bei „jetzt alle gleichzeitig abstimmen!" (>~10–15 quasi-gleichzeitige Schreibzugriffe) laufen mehrere ungeschützte Zyklen parallel und überschreiben sich — Stimmen verschwinden lautlos, jede Anfrage meldet `{ok:true}`.
- **Fix:** Bei Lock-Erschöpfung mit 503/429 ablehnen (Client-Retry) statt ungeschützt schreiben; alternativ atomare Redis-Operationen (Lua).

### Sonstiges (high)

**Kein Doppel-Submit-Schutz — Doppelklick/Doppel-Enter erzeugt zwei Präsentationen** *(hierhin thematisch, medium, siehe unten)* — wird im medium-Abschnitt geführt.

---

## 🟡 Sollte behoben werden (medium)

### Editor & Antwortoptionen

**Antwortoptionen lassen sich bis auf 0 löschen — Publikum sieht eine leere, nicht abstimmbare Folie** — `Editor / Antwortoptionen` · `public/presenter.html:692`
- **Problem:** Der ×-Button prüft keine Mindestanzahl; `sanitizeSlide` akzeptiert ein leeres `options`-Array; `vote.html` rendert dann eine leere Box.
- **Wirkung:** Hektisches Aufräumen kurz vor der Präsentation kann alle Optionen löschen — live sieht das Publikum nur die Frage ohne Abstimmmöglichkeit.
- **Fix:** Entfernen deaktivieren/bestätigen ab Mindestanzahl (2 für choice/quiz/ranking, 1 für points); serverseitig kein Aktivschalten leerer Folien.

**Quiz-Antwortschlüssel defaultet stillschweigend auf die erste Option** — `Editor / Quiz` · `lib/domain.mjs:64`
- **Problem:** `sanitizeSlide` und `applyTypeDefaults` setzen `correct=0`; es gibt keinen Zustand „noch nicht gewählt". Option 1 gilt von Anfang an als richtig.
- **Wirkung:** Übersieht der Moderator das Dropdown, wird die erste Option automatisch als richtig gewertet — fällt oft erst auf, wenn die Rangliste nicht passt.
- **Fix:** `correct` initial `-1`/`null`, deutlich als „nicht gewählt" kennzeichnen (Warn-Badge), optional Live-Schalten blockieren, bis gesetzt.

**Doppelte identische Optionstexte werden nie geprüft — beim Quiz wird eine augenscheinlich richtige Option als falsch gewertet** — `Editor / Antwortoptionen` · `lib/domain.mjs:56`
- **Problem:** Keine Duplikatsprüfung; `' Berlin'` und `'Berlin '` kollabieren nach dem Trimmen zu identischem Text, `correct` markiert aber nur einen Index.
- **Wirkung:** Tippt das Publikum auf die textlich identische, aber „falsche" Option, wird die Antwort trotz sichtbar gleichem Text als falsch gewertet — leicht provozierbar per Copy-Paste.
- **Fix:** Beim Speichern trim-/case-normalisierte Duplikate erkennen und warnen/zusammenführen.

**50-Folien-Obergrenze wird serverseitig lautlos abgeschnitten** — `Editor / Folienverwaltung` · `api/index.js:495`
- **Problem:** `slice(0,50)` kappt jede Anfrage, antwortet aber weiter mit `200 {ok:true}`; der Editor prüft die Länge nie und übernimmt das zurückgegebene Array nicht.
- **Wirkung:** Eine 51. Folie zeigt „gespeichert", verschwindet aber beim nächsten Reload — wirkt wie zufälliger Datenverlust.
- **Fix:** `btnAddSlide` ab 50 deaktivieren/Hinweis; Server 400 `too_many_slides` zurückgeben; Client das autoritative `slides`-Array übernehmen.

**Kein Doppel-Submit-Schutz beim Erstellen — Doppelklick erzeugt zwei Präsentationen** — `Präsentation erstellen` · `public/index.html:126`
- **Problem:** Der Create-Handler hat kein Guard-Flag analog zu `joining`; kein disabled-Button. Zwei parallele POSTs legen zwei Präsentationen an, beide schreiben in `puls.mine`.
- **Wirkung:** Nervöses Doppelklicken erzeugt still doppelte Präsentationen — verwirrende Duplikate, verschwendetes Kontingent, unklar welcher Link der richtige ist.
- **Fix:** `creating`-Flag einführen und Button während des Requests deaktivieren.

**Keine sichtbare Ladeanzeige bei „Teilnehmen"/„Erstellen"** — `Onboarding / Ladezustände` · `public/index.html:38`
- **Problem:** Weder Join- noch Create-Button werden während des API-Calls deaktiviert oder in einen Ladezustand versetzt.
- **Wirkung:** Bei Vercel-Kaltstart/langsamem Mobilfunk wirkt ein reaktionsloser Button binnen Sekunden wie ein Absturz — Nutzer klicken erneut (beim Create → Duplikate).
- **Fix:** Bei Submit sofort deaktivieren und Text/Spinner umschalten („Wird geprüft …"/„Wird erstellt …").

**PPTX-Exportfehler hängt rohen technischen JS-Fehlertext an die deutsche Meldung** — `Editor / Export-Fehlermeldungen` · `public/presenter.html:943`
- **Problem:** Bei Fehlschlag wird `t('presenter.pptxFailed') + e.message` gezeigt; `e.message` ist die rohe englische Browser-/JS-Meldung (z. B. „Failed to fetch").
- **Wirkung:** Sprachlich gemischter Techniksatz statt verständlicher Meldung — bei instabilem WLAN unprofessionell.
- **Fix:** Bekannte Ursachen auf übersetzte Meldungen mappen; Rohtext höchstens als sekundäres, aufklappbares Detail.

**Kein Kopieren-Button für Zugangscode/Link im Editor oder auf der Beitritts-Bühne** — `Editor / Publikums-Zugang` · `public/presenter.html:34`
- **Problem:** Code, Join-URL und QR sind reiner Text/Grafik ohne Klick-zum-Kopieren — obwohl die Startseite den fertigen Copy-Button-Baustein bereits hat.
- **Wirkung:** Bei hybriden/Remote-Investoren muss der Moderator Code/URL manuell markieren statt in den Chat zu pasten — unnötige Reibung im schnellen Moment.
- **Fix:** Denselben Copy-Button (aus `buildSecureBlock()`) für Join-Code/URL im Editor und auf der Beitritts-Bühne wiederverwenden.

### Präsentationsmodus

**Reload mitten in der Präsentation wirft ohne Rückfrage in die volle Editor-Oberfläche** — `Präsentationsmodus / Robustheit` · `public/presenter.html:995`
- **Problem:** `presenting`/`joinStage`/Vollbild sind reine In-Memory-Variablen (nicht persistiert). Ein Reload lädt zwingend den Editor-Modus.
- **Wirkung:** Ein versehentliches Cmd+R zeigt allen die Bearbeitungsoberfläche (Slide-Editor, „Alle zurücksetzen", ggf. Token in der Adressleiste) statt der Präsentation.
- **Fix:** Presenting-Zustand (mind. `presenting` + `activeIndex`) in `sessionStorage` merken und Wiedereinstieg anbieten.

**Jeder Wiedereinstieg in den Präsentationsmodus springt zur Beitritts-/QR-Bühne** — `Präsentationsmodus / Navigation` · `public/presenter.html:995`
- **Problem:** `enterPresent()` setzt `joinStage=true` unbedingt, unabhängig vom `activeIndex`.
- **Wirkung:** Nach Esc/„Beenden" mitten in Folie 7 landet der Moderator beim erneuten „Präsentieren" wieder auf der QR-Bühne — wirkt wie ein Session-Neustart.
- **Fix:** `joinStage` nur bei frischer Session auf true setzen, sonst direkt zur zuletzt aktiven Folie.

**Selbststeuerung bleibt im Präsentationsmodus unsichtbar — Weiter/Zurück steuern nicht das Publikum** — `Präsentationsmodus / Self-Paced` · `public/presenter.html:1060`
- **Problem:** `renderPresent()` prüft nie `snap.selfPaced`; kein Badge, keine geänderte Beschriftung.
- **Wirkung:** Der Moderator klickt „Weiter" in der Annahme, den Raum mitzunehmen — bewegt aber nur seine eigene Ansicht; sichtbare Verwirrung.
- **Fix:** Deutlichen „Selbststeuerung aktiv"-Hinweis einblenden und Beschriftung anpassen.

**Jedes Ansteuern einer Quiz-Folie versteckt Ergebnisse erneut und setzt den Tempo-Timer zurück** — `Präsentationsmodus / Quiz` · `server.js:1345` *(zusammengefasst: „resultsHidden re-hide" + „startedAt-Reset bei Revisit")*
- **Problem:** Der `/state`-Handler setzt bei jedem Ansteuern einer Quiz-Folie unbedingt `resultsHidden=true` und `startedAt=Date.now()` — auch beim blossen Zurück- und wieder Vorblättern.
- **Wirkung:** Kurzes Zurückspringen auf eine bereits aufgelöste Quiz-Folie versteckt Balken/Rangliste wieder (wirkt wie Datenverlust) und verzerrt den Tempo-Bonus für danach Antwortende (zwei Zeitfenster in derselben Frage).
- **Fix:** `resultsHidden`/`startedAt` nur beim ERSTMALIGEN Aktivieren setzen (`if (act.startedAt == null)` bzw. `revealed`-Flag).

**Reset/Archivieren einer Quiz-Folie setzt den Tempo-Timer nicht zurück — neue Antworten bekommen dauerhaft nur den Mindestwert** — `Präsentationsmodus / Quiz-Timing` · `lib/domain.mjs:376`
- **Problem:** `archiveSession()`/„Antworten zurücksetzen" leeren `slide.answers`, lassen `startedAt` aber unangetastet. Nach 20 s ist `quizPoints()` auf 500 eingefroren.
- **Wirkung:** Wiederholt der Moderator eine Quiz-Runde (naheliegend, um Nachzügler einzubinden), vergibt jede richtige Antwort exakt 500 Punkte — der Tempo-Bonus wirkt kaputt.
- **Fix:** Beim Reset/Archivieren `delete slide.startedAt`.

**Quiz-Antwortschlüssel im laufenden Präsentationsmodus veraltet bei Bearbeitung in einem zweiten Tab** — `Präsentationsmodus / Mehrere Tabs` · `public/presenter.html:1099`
- **Problem:** `renderPresent()` liest die „richtige" Option aus dem gecachten `pres.slides`; `refreshResults()` aktualisiert nur `latestResults`, nie `pres.slides`.
- **Wirkung:** Korrigiert ein Kollege in Tab B den Schlüssel, markiert die Bühne weiter die ALTE Antwort als richtig — ohne Hinweis.
- **Fix:** Bei jedem Snapshot (mind. Folienwechsel) die vollständigen Admin-Foliendaten inkl. `correct` neu laden.

**„Neue Sitzung starten" löscht auch alle Q&A-Fragen unwiderruflich — inkl. Moderationswarteschlange** — `Präsentationsmodus / Q&A & Archiv` · `lib/domain.mjs:365`
- **Problem:** `sessionSummary()` archiviert für `qa` keine einzige Frage (default-Zweig), danach leert `archiveSession()` alle `answers`. Der Bestätigungsdialog erwähnt nur generisch „Antworten geleert".
- **Wirkung:** Zwischen zwei Programmpunkten „Neue Sitzung starten" löscht still alle offenen Publikumsfragen samt Freigabe-Warteschlange — unwiederbringlicher Datenverlust bei Live-Q&A.
- **Fix:** In `sessionSummary()` die (freigegebenen) Q&A-Fragen mitschreiben; Dialog kontextabhängig warnen, wenn `pendingQuestions()` existiert.

### Publikum / Abstimmung

**Verbindungsstatus wird nirgends angezeigt — App wirkt bei Netzausfall eingefroren** — `Publikum / Abstimmen` · `public/vote.html:120`
- **Problem:** `connectStream(..., onStatus)` meldet intern `live`/`reconnect`, aber weder `vote.html` noch `presenter.html` verdrahten den Callback.
- **Wirkung:** Bricht SSE ab und schlägt das Polling fehl, bleibt die Seite ohne Hinweis auf dem letzten Stand — der Teilnehmer stimmt weiter ab, ohne dass etwas ankommt.
- **Fix:** `onStatus` anschliessen und bei `reconnect` einen dezenten „Verbindung wird wiederhergestellt …"-Hinweis zeigen, der bei `live` verschwindet.

**Bestätigen-Button bleibt während der Anfrage aktiv — Doppel-Tap verfälscht Quiz-Feedback** — `Publikum / Abstimmen` · `public/vote.html:360`
- **Problem:** Der Button wird erst nach Antwort deaktiviert. Ein Doppel-Tap löst zwei POSTs aus; kommt die 409-Antwort nach der 200-Antwort an, überschreibt der `onErr`-Zweig das echte Quiz-Feedback mit „bereits abgegeben".
- **Wirkung:** Ausgerechnet beim Quiz erfährt der Teilnehmer nie, ob er richtig lag / wie viele Punkte — dazu doppelte Q&A-/offene Antworten.
- **Fix:** Button synchron beim Klick (vor dem await) deaktivieren; eine zweite `already_answered`-Antwort clientseitig ignorieren.

**Kein Doppel-Submit-Schutz bei offener Frage/Wortwolke — Doppelklick erzeugt zwei identische Karten auf der Wand** — `Publikum / Abstimmen` · `public/vote.html:614`
- **Problem:** `sendOpen()`/`send()` sperren erst asynchron im Erfolgsfall; `applyAnswer` erlaubt bis 5 Einträge ohne Duplikaterkennung (`list.push`).
- **Wirkung:** Doppel-Klick/Enter schickt denselben Text zweimal — beide erscheinen als identische Karten auf der projizierten Wand, wie ein Software-Fehler.
- **Fix:** Bei Klick/Enter synchron sperren; optional serverseitig identischen Text desselben pid im kurzen Fenster deduplizieren.

**„Bereits abgestimmt"-Status nur in sessionStorage — verschwindet beim Tab-Neustart, obwohl die Identität bleibt** — `Publikum / Abstimmen` · `public/vote.html:75`
- **Problem:** `votedStore()` nutzt sessionStorage, während `participantId`/Name/Upvotes bewusst in localStorage liegen.
- **Wirkung:** Tab schliessen und per QR erneut öffnen zeigt wieder das volle Kontingent; Quiz-Feedback (richtig/falsch, Punkte) ist verloren, während der Server nur `already_answered` liefert.
- **Fix:** `votedStore` ebenfalls in localStorage führen.

**Reset/Archivieren löscht Namen serverseitig — Client merkt es nie, Namen fehlen fortan** — `Publikum / Abstimmen` · `server.js:1371`
- **Problem:** `POST /reset` ohne slideId (und `archiveSession`) löschen `pres.names={}`; `storedName()` liest den Namen weiter aus localStorage, das Namens-Gate erscheint nie erneut, `/identify` wird nie wieder aufgerufen.
- **Wirkung:** „Runde 1 fertig, für Runde 2 zurücksetzen" macht alle identifizierten Teilnehmer anonym — in der Rangliste als „Gast 3f2a" statt Name — ohne Hinweis.
- **Fix:** `pres.names` beim Reset/Archive NICHT löschen (Name ist pro Person, nicht pro Runde) oder per Snapshot-Flag den Client zum erneuten Namens-Gate zwingen.

**Nachträgliches Aktivieren von „Namen erfassen" reisst Teilnehmer aus der laufenden Eingabe** — `Publikum / Abstimmen` · `public/vote.html:136`
- **Problem:** Das Gate `collectNames && !storedName()` fliesst in den `renderedKey`; ein sofortiger SSE-Push nach dem Umschalten ersetzt `root.innerHTML` und blendet das Namens-Gate über die offene Eingabe.
- **Wirkung:** Schaltet die Moderation „Namen erfassen" mitten in einer Frage ein, verlieren alle Teilnehmer mit unbestätigter offener Antwort/Ranking/Punkteverteilung diese kommentarlos.
- **Fix:** Namens-Gate nur beim Folienwechsel zeigen, nicht rückwirkend über eine offene Eingabe legen.

**Tempo-Bonus beim Quiz (1000→500 in 20 s) ist für Teilnehmer unsichtbar** — `Publikum / Abstimmen` · `public/vote.html:509`
- **Problem:** `buildQuiz()` baut keinen Timer/Countdown; `startedAt` wird sogar aktiv aus dem Snapshot gelöscht, bevor er die Voter erreicht.
- **Wirkung:** Ein zentrales Gamification-Feature bleibt unentdeckt; unterschiedliche Punkte bei gleicher Antwort wirken wie Zufall statt Feature — schwächt den Show-Effekt.
- **Fix:** Sichtbaren Countdown/Fortschrittsbalken ergänzen (Aktivierungs-Timestamp separat broadcasten).

**Kein Hinweis auf das 5-Antworten-Limit bei offenen Fragen und Q&A** — `Publikum / Offene Frage & Q&A` · `public/vote.html:602`
- **Problem:** Die Wortwolke zeigt „Noch X Begriffe", offene Frage/Q&A nicht — obwohl serverseitig dasselbe Limit (5) gilt.
- **Wirkung:** Der Nutzer erfährt vom Limit erst, wenn der 6. Versuch mit „limit_reached" fehlschlägt — bei Q&A besonders ärgerlich.
- **Fix:** Analog zur Wortwolke „noch X von 5 möglich" unter dem Eingabefeld einblenden.

**Wortwolken-Zählung durch mehrfaches Einreichen desselben Begriffs manipulierbar** — `Publikum / Wortwolke` · `lib/domain.mjs:122`
- **Problem:** `applyAnswer` (wordcloud) verhindert nicht, dass ein Teilnehmer innerhalb seines Kontingents denselben Begriff mehrfach sendet; `computeResults` zählt jeden Eintrag.
- **Wirkung:** Eine Person kann ein Wort +3 statt +1 gewichten — ein einzelner Scherzbold verzerrt die projizierte Wortwolke sichtbar.
- **Fix:** Pro Teilnehmer nur einen Zähl-Beitrag je eindeutigem (normalisiertem) Wort zulassen.

**Fehlgeschlagener Beitritt zeigt immer „Kein aktives Event" — auch bei reinem Netzwerkfehler, ohne Retry** — `Publikum / Beitritt` · `public/vote.html:121`
- **Problem:** `init()` fängt jeden Fehler identisch ab und zeigt „Kein aktives Event", egal ob der Code unbekannt ist oder nur die Anfrage scheiterte.
- **Wirkung:** Bei schwachem Konferenz-WLAN wird dem Teilnehmer gesagt, sein korrekter Code existiere nicht — Vertrauensverlust, nur Link zur Startseite statt Retry.
- **Fix:** Netzwerk-/Timeout-Fehler (kein Response/≥500) von echtem 404 trennen und „Verbindung fehlgeschlagen — erneut versuchen" mit Retry-Button zeigen.

**Beantwortete Quiz-Optionen wirken weiterhin aktiv; falsche Antwort sieht aus wie normale Auswahl** — `Publikum / Quiz` · `public/vote.html:517`
- **Problem:** Es gibt keine `.vote-option:disabled`-Regel (anders als bei `.ranking-move`/`.qa-like`); die eigene (falsche) Wahl trägt dieselbe `.selected`-Markierung wie ein offener Auswahlzustand.
- **Wirkung:** Teilnehmer glauben, sie könnten noch ändern (Taps verpuffen), und die „falsch"-Info ist leicht zu übersehen.
- **Fix:** Beim Sperren eine `disabled`/`is-locked`-Klasse (reduzierte Opazität) setzen; falsche Wahl mit `--danger`-Rahmen kennzeichnen.

### Darstellung

**Lange/zusammengesetzte Präsentationstitel brechen das Layout in „Meine Präsentationen"** — `Meine Präsentationen` · `public/app.css:96`
- **Problem:** `.my-presentations .item .t` hat weder `overflow-wrap` noch `min-width:0` (Titel bis 120 Zeichen). Ein langes Wort/URL zwingt Min-Content-Breite über die volle Textlänge.
- **Wirkung:** Ein realistisches deutsches Kompositum sprengt die Zeile und erzeugt horizontales Scrollen auf der Startseite.
- **Fix:** `overflow-wrap: anywhere` ergänzen (konsistent mit den übrigen Text-Containern).

**„Meine Präsentationen" lässt sich nie bereinigen — keine Lösch-/Alters-Anzeige** — `Meine Präsentationen` · `public/index.html:216`
- **Problem:** Jeder Eintrag bietet nur „Link sichern" und „Moderieren"; `DELETE /api/presentations/:id` wird nie aufgerufen; abgelaufene (60 Tage) Präsentationen bleiben lokal sichtbar.
- **Wirkung:** Nach Proben füllt sich die Liste mit toten Einträgen, die beim Moderieren „nicht gefunden" zeigen — wirkt unaufgeräumt.
- **Fix:** „Entfernen"-Button pro Eintrag (lokal); optional per HEAD/GET markieren, ob der Eintrag noch existiert.

**100-Punkte-Verteilung zerbricht bei realistisch langen Optionsbezeichnungen auf schmalen Screens** — `Publikum / Punkte-Verteilung` · `public/app.css:289`
- **Problem:** `.points-label` und `.points-range` sind beide `flex:1` (starr 50/50); bei 320 px bricht das Label mit `word-break` mitten im Wort, der Regler wird eng.
- **Wirkung:** Bei gewöhnlichen längeren Optionstexten wird die Verteilung auf dem Handy kaum lesbar/bedienbar.
- **Fix:** Auf schmalen Screens zweizeilig stapeln (Label voll, Regler+Wert darunter); Regler mit fester Mindestbreite.

**Wortwolke ignoriert die individuelle Markenfarbe** — `Branding / Wortwolke` · `public/common.js:364`
- **Problem:** `renderWordcloud()` nutzt ausschliesslich die fest kodierte `BRAND_SEQUENCE`, unabhängig von der per `applyBrand()` gesetzten `--primary`.
- **Wirkung:** Bei gesetzter Akzentfarbe (z. B. Blau) bleiben Buttons/Balken korrekt, die Wortwolke aber Bordeaux — Bruch der Corporate Identity, gerade wenn Branding als Verkaufsargument gezeigt wird.
- **Fix:** Farbsequenz bei gesetzter Custom-Farbe aus `--primary`/`--primary-dark` (bzw. abgeleiteten Tönen) aufbauen.

### Barrierefreiheit

**Grauer Hilfe-/Meta-Text unterschreitet durchgängig den WCAG-AA-Kontrast** — `Barrierefreiheit / Kontrast` · `public/design-system.css:20`
- **Problem:** `--grey-4` (#7A7870) auf Weiss ≈ 4,42:1 (< 4,5:1), verwendet für `.field .help`, Folienposition, `.ds-card-subtitle`, `.join-url`, `.footer-note`.
- **Wirkung:** Systemweites Kontrastproblem, das bei Lighthouse/axe sofort als Fehler auffällt.
- **Fix:** `--grey-4` für Fliesstext auf ≥ #6B6960 abdunkeln oder für Hilfetexte `--grey-5` (#5A5D5C) nutzen.

**Fehlermeldungen von Beitritt/Erstellen werden nicht per Screenreader angekündigt** — `Barrierefreiheit` · `public/index.html:39`
- **Problem:** `#joinError`/`#createError` sind einfache `<div>`s ohne `aria-live`/`role="alert"`; Text wird nur per `textContent` gesetzt.
- **Wirkung:** Screenreader-Nutzer bekommen bei falschem Code/Rate-Limit keinerlei Rückmeldung.
- **Fix:** `aria-live="polite"` (bzw. `role="alert"`) auf beide Container.

**QR-Codes ohne zugänglichen Namen** — `Barrierefreiheit / QR` · `public/common.js:467`
- **Problem:** `renderQR()` schreibt SVG ohne `<title>`/`role="img"`/`aria-label`.
- **Wirkung:** Screenreader überspringen den QR-Code komplett — blinde Nutzer erfahren nicht, dass die prominenteste Beitrittsmöglichkeit dort liegt.
- **Fix:** Dem SVG `role="img"` und ein sprechendes `aria-label`/`<title>` geben („QR-Code zum Beitreten unter <URL>").

**Alle Reaktions-Buttons tragen identisches aria-label** — `Publikum / Reaktionen` · `public/vote.html:193`
- **Problem:** Alle 6 Emoji-Buttons erhalten `t('vote.react.aria')` = „Reaktion senden".
- **Wirkung:** VoiceOver/NVDA liest sechsmal identisch vor — die Reaktion ist für Screenreader-Nutzer faktisch zufällig.
- **Fix:** Pro Emoji ein sprechendes Label („Daumen hoch", „Herz", „Applaus" …).

**Ausgewählte Antwortoption wird nur visuell markiert — kein aria-pressed/aria-checked** — `Publikum / Abstimmen` · `public/vote.html:452`
- **Problem:** `buildChoice/ChoiceMulti/Scale/Quiz` markieren die Wahl nur per `.selected`, ohne ARIA-State/`role="radio"`.
- **Wirkung:** Screenreader-Nutzer erkennen nicht, welche Antwort gewählt/übernommen wurde — kritisch beim gesperrten Quiz.
- **Fix:** `aria-pressed` (Mehrfachauswahl) bzw. `role="radio"`+`aria-checked` (Einfachauswahl) konsistent mitführen.

**Reaktions-Buttons unterschreiten die 44px-Touch-Zielgröße** — `Publikum / Reaktionen` · `public/app.css:484`
- **Problem:** `.reaction-btn` ergibt ≈37 px Höhe (kein `min-height`), während alle anderen Steuerelemente 44–48 px haben.
- **Wirkung:** Auf dem Handy sind die Emoji-Buttons schwerer zu treffen — Fehltipps bei schnellem Reagieren.
- **Fix:** `min-height/min-width: 44px` auf `.reaction-btn`.

**Zu kleine Tap-Ziele in der Folien-/Optionsverwaltung des Editors** — `Editor / Touch` · `public/app.css:130`
- **Problem:** `.option-row .ds-btn` (28,9×35), `#btnAddOption` (81×30), `.overflow-btn` (47×32) liegen unter 44×44 — obwohl `.rank-handle`/`.ranking-move` korrekt 44 px haben.
- **Wirkung:** Beim Vorbereiten/Nachjustieren vom Tablet trifft man „×"/„⋯" leicht daneben.
- **Fix:** `min-width/min-height: 44px` auf die drei Selektoren.

### API/Backend

**Redis-Lock ohne Besitz-Token: DEL kann ein fremdes, neu vergebenes Lock aufheben** — `API/Backend / Race` · `api/index.js:116`
- **Problem:** Lock wird mit fixem Wert `'1'` (SET NX PX 5000) gesetzt und im finally bedingungslos per DEL entfernt. Läuft `fn()` >5 s (Latenzspitze, `maxDuration:15`), verfällt das Lock, ein Zweiter erwirbt es, der Erste löscht es fremd.
- **Wirkung:** In den verkehrsreichsten Momenten können sich zwei Schreibvorgänge überschreiben — Stimmen verschwinden lautlos.
- **Fix:** Eindeutiges Lock-Token pro Versuch (`randomUUID`) und Compare-and-Delete per Lua-Skript.

**Emoji-Reaktionen erzwingen auf Vercel pro Tap ein volles Read-Modify-Write unter demselben Lock wie echte Stimmabgaben** — `API/Backend / Performance` · `api/index.js:353`
- **Problem:** Anders als auf `server.js` (flüchtig, kein Save) wird pro Reaktion die komplette Präsentation gelesen, mutiert und unter dem Haupt-Lock zurückgeschrieben — für einen 6-Sekunden-Ring-Buffer; kein Client-Throttle.
- **Wirkung:** „Alle jetzt reagieren!" konkurriert mit echten Stimmabgaben um Lock/Roundtrips — verzögert beide, erhöht Kontention und Upstash-Kosten.
- **Fix:** Reaktionen in einem eigenen Redis-Key mit kurzer TTL (LPUSH+EXPIRE) führen, entkoppelt vom Haupt-Lock.

**In-Memory-Fallback auf Vercel bei fehlender Redis-Konfiguration lautlos und zwischen Instanzen inkonsistent** — `API/Backend / Persistenz` · `api/index.js:41`
- **Problem:** Fehlen die Redis-Env-Variablen (frisches Preview, rotierte Credentials), fällt der Store still auf `globalThis.__pulsMem` — ohne Log/Health-Flag; jede Lambda-Instanz hat ihre eigene Map.
- **Wirkung:** Bei paralleler Last können Stimmen in einer anderen Instanz landen als der Presenter abfragt; jede Anfrage meldet `{ok:true}` — schlechtester Ausfallmodus.
- **Fix:** `hasRedis=false` explizit signalisieren (z. B. `/api/server-info`) und im UI als „Testmodus" warnen; in Produktion ohne Redis hart fehlschlagen.

**Globale Obergrenze für Präsentationen existiert nur im Hetzner-Server, nicht im Vercel-Pfad** — `API/Backend / Ressourcenschutz` · `api/index.js:23`
- **Problem:** `server.js` begrenzt hart auf `MAX_PRESENTATIONS=2000` mit LRU-Prune; `api/index.js` hat nur die passive 60-Tage-TTL.
- **Wirkung:** In Kombination mit dem umgehbaren Rate-Limit kann der Upstash-Speicher über Wochen unbegrenzt wachsen (Kosten/Kontingent).
- **Fix:** Auch auf Vercel eine weiche Obergrenze (Cron/SCAN-Cleanup oder Zähler-Key mit Alarmschwelle).

**Archivieren/Zurücksetzen während offener Abstimmung kann Stimmen in die falsche Session einsortieren** — `API/Backend / Nebenläufigkeit` · `api/index.js:556`
- **Problem:** `/archive`/`/reset` leeren `answers` unter dem Lock; eine parallele, vorher gestartete `/answers`-Anfrage, die erst danach das Lock bekommt, schreibt in die geleerten Antworten. `votingLocked` wird dabei nie erzwungen.
- **Wirkung:** Nach dem Archivieren erscheinen vereinzelte „Geister-Stimmen" in der neuen Runde.
- **Fix:** Vor Archivieren/Zurücksetzen automatisch `votingLocked=true` (im selben Lock).

**participantId aus dem Body wird ungeprüft als Objekt-Schlüssel verwendet — Kollision mit Object.prototype-Namen** — `API/Backend / Eingabevalidierung` · `lib/domain.mjs:296` · *(security)*
- **Problem:** `if (pid in slide.answers)` schlägt auch für ererbte Namen an; `participantId="constructor"` sperrt die erste Quiz-Antwort fälschlich als `already_answered`, `"__proto__"` verändert den Prototyp des jeweiligen Objekts.
- **Wirkung:** Ein direkter API-Aufruf kann sich selbst dauerhaft vom Quiz aussperren (verwirrender Fehler ohne Ursache); Prototyp-Injektion als riskantere Variante.
- **Fix:** `participantId` per Positivliste (Hex/UUID) validieren und/oder Dictionaries als `Object.create(null)` bzw. `hasOwnProperty.call` statt `in`.

**server.js sendet überhaupt keine Sicherheits-Header — nur die Vercel-Variante ist gehärtet** — `API/Backend / Sicherheit` · `server.js:539`
- **Problem:** `sendJSON()`/`serveStatic()` setzen nur Content-Type/Cache-Control; CSP/X-Frame-Options/Referrer-Policy fehlen in der App. (In der Praxis liegt die Härtung am nginx-Reverse-Proxy `deploy/nginx-puls.conf` — für Nicht-nginx-Selbsthosting-Setups fehlt sie aber komplett.)
- **Wirkung:** Ohne vorgelagerten Proxy (Windows-Start, lokaler Betrieb) ist presenter.html clickjacking-fähig und ohne CSP-Fallback.
- **Fix:** Die vercel.json-Header (CSP, X-Frame-Options, Referrer-Policy, X-Content-Type-Options) zentral in `sendJSON()`/`serveStatic()` als Defense-in-Depth übernehmen.

**CSP erlaubt 'unsafe-inline' bei script-src und bietet damit keinen echten XSS-Schutz** — `Sicherheit` · `vercel.json:20` · *(security)*
- **Problem:** Weil die Client-Logik in grossen Inline-`<script>`-Blöcken steckt, ist `'unsafe-inline'` gesetzt — jede künftige XSS-Lücke würde ausgeführt (aktuell durch konsequentes `esc()`-Escaping abgefangen, keine aktive Lücke).
- **Wirkung:** Die CSP suggeriert Härtung, bietet aber keine zweite Verteidigungslinie — trügerisch bei einer Security-Prüfung.
- **Fix:** Inline-Skripte schrittweise in externe Dateien mit Nonce/Hash-CSP auslagern (v. a. presenter.html) oder die Grenze klar dokumentieren.

### i18n / Datenschutz-Content

**Rangliste zeigt hartcodierten deutschen Platzhalternamen „Gast" unabhängig von der UI-Sprache** — `Publikum / Quiz-Rangliste` · `lib/domain.mjs:342`
- **Problem:** Fallback `'Gast ' + pid` läuft nie durch i18n (dupliziert in `server.js:256`).
- **Wirkung:** Bei englischer UI steht mitten im projizierten Leaderboard „Gast 3f2a" — im aufmerksamkeitsstärksten Moment.
- **Fix:** Fallback über i18n-Key lösen; Duplikation zwischen `server.js` und `lib/domain.mjs` auflösen.

**Fest codierter deutscher Platzhaltertitel „Unbenannte Präsentation" auch in der englischen UI — bis aufs Publikums-Handy** — `i18n / Erstellen` · `server.js:162`
- **Problem:** Leerer Titel → hart `'Unbenannte Präsentation'` (auch `api/index.js:245`); erscheint in Presenter-Kopf, jedem vote.html-Kopf, Mail-Betreff, „Meine Präsentationen".
- **Wirkung:** Sofort sichtbarer Sprachbruch auf jedem Bildschirm bei englischer Demo.
- **Fix:** Fallback sprachabhängig wählen (Accept-Language/UI-Sprache) oder Titelfeld clientseitig mit lokalisiertem Default vorbefüllen.

**Anrede wechselt unvermittelt von Sie zu Du** — `Publikum / Tonalität` · `public/i18n.js:217`
- **Problem:** `vote.qa.boardHint` und `vote.thanks` duzen, während die App sonst konsequent siezt — beide erscheinen auf vote.html neben siezenden Texten.
- **Wirkung:** Wirkt zusammengesetzt/unfertig, der Bruch fällt sofort auf.
- **Fix:** Beide Strings auf Sie-Form vereinheitlichen.

**Datenschutzhinweis verschweigt Namensanzeige in der öffentlichen Quiz-Rangliste** — `Datenschutz` · `public/datenschutz.html:49` · *(content)*
- **Problem:** Als Anzeigeorte nennt der Hinweis nur „Q&A-Fragen und offene Antworten"; tatsächlich zeigt die projizierte 🏆-Rangliste den Namen ebenfalls (auch der In-App-Hilfetext am Schalter ist so falsch).
- **Wirkung:** Teilnehmer werden nicht informiert, dass ihr Name öffentlich auf der Bühne mit Punktzahl erscheint — die relevantere Offenlegung fehlt.
- **Fix:** In der Aufzählung ergänzen, dass Namen auch in der öffentlich projizierten Quiz-Rangliste erscheinen.

**Quickstart-Anleitung zeigt die alte Editor-UI von vor dem A–D-Redesign** — `Anleitung` · `public/anleitung.html:93` · *(content)*
- **Problem:** Screenshots/Texte zeigen den alten 2-Spalten-Editor ohne Typ-Galerie/Live-Vorschau/⋯-Menü, ohne neue Beitritts-Bühne und „Zugang sichern"-Flow. Ein Umsetzungsplan liegt vor, ist aber noch nicht gemergt.
- **Wirkung:** Klickt ein Investor auf „Anleitung", sieht er eine sichtlich ältere Oberfläche als die live gezeigte App — wirkt ungepflegt.
- **Fix:** Den vorliegenden Guide-Revamp-Plan umsetzen (Screenshots neu, DE/EN-Texte, PDFs).

**Verlust des Moderationslinks ist endgültig — der Hinweistext suggeriert Wiederauffindbarkeit** — `Onboarding / Session-Wiederherstellung` · `public/index.html:134`
- **Problem:** Der Admin-Token wird nur bei Erstellung ausgegeben und nur lokal gespeichert; es gibt keinen Recovery-Mechanismus. Der `laterHint` verspricht aber „finden Sie später auch unter Meine Präsentationen" (die Zielseite ist selbst nur browsergebunden).
- **Wirkung:** Auf Leih-Laptop/Privatmodus/nach Cache-Leerung ist der Zugriff unwiederbringlich weg — falsches Sicherheitsgefühl im kritischen Moment.
- **Fix:** `laterHint` um den Browser-Vorbehalt ergänzen und einen erzwungenen Kopier-/Sicher-Schritt einbauen; optional serverseitige E-Mail-Bindung mit Resend.

---

## ⚪ Politur / später (low)

**429-Rate-Limit beim Erstellen zeigt irreführende „läuft der Server noch?"-Meldung** — `Onboarding / Erstellen` · `public/index.html:138`
- **Problem:** Der catch-Block zeigt bei jedem Fehler `errFailed`; 429 `rate_limited` wird nicht ausgewertet.
- **Wirkung:** Beim Proben (30 Neuanlagen/h) suggeriert die Meldung einen Server-Ausfall.
- **Fix:** Nach `err.status === 429` verzweigen und eine eigene, klare Meldung zeigen.

**SVG-Logo-Upload meldet Erfolg, das Logo wird aber serverseitig nie gespeichert** — `Editor / Branding` · `api/index.js:452`
- **Problem:** Client prüft nur `file.size` (nicht `file.type`); Server-Regex akzeptiert nur png/jpeg/gif/webp, lässt `brandLogo` bei SVG unverändert, antwortet aber `{ok:true}`.
- **Wirkung:** Ein versehentlich hochgeladenes SVG-Logo wird still ignoriert — fällt erst live auf.
- **Fix:** Client `file.type` prüfen; Server bei nicht unterstütztem Format 400 `unsupported_format` statt 200.

**exitPresent() lädt den Editor ohne Fehlerbehandlung neu** — `Präsentationsmodus / Fehlerbehandlung` · `public/presenter.html:1031`
- **Problem:** `load()` ohne `.catch()` (anders als der initiale Aufruf). Bei Netzfehler bleibt der Editor im zuletzt gültigen Stand ohne Meldung/Retry.
- **Wirkung:** Stilles Fehlschlagen ohne Hinweis, dass ein Reload helfen würde.
- **Fix:** `load()` mit `.catch()` absichern und Fehlermeldung mit Retry-Button.

**Exportierte Zeitstempel ohne Zeitzonenangabe — auf Vercel UTC statt Ortszeit** — `Export / Formate` · `lib/domain.mjs:660`
- **Problem:** `formatTs()` nutzt lokale Getter ohne TZ-Kennzeichnung; Vercel-Node läuft in UTC.
- **Wirkung:** „Zeitpunkt"-Spalte weicht 1–2 h von der Ortszeit ab, ohne Hinweis.
- **Fix:** `process.env.TZ` setzen oder Spaltenkopf „Zeitpunkt (UTC)".

**Escape-Taste beendet den Live-Präsentationsmodus sofort ohne Rückfrage** — `Präsentationsmodus` · `public/presenter.html:1164`
- **Problem:** Escape ruft ungefragt `exitPresent()` (reiner lokaler UI-State; Publikum unberührt).
- **Wirkung:** Ein Fehltastendruck wirft die projizierte Bühne kurz in den Editor (plus Beitritts-Bühnen-Rücksprung); trivial reversibel.
- **Fix:** Escape/Exit nur mit kurzer Bestätigung wirken lassen, wenn eine Live-Bühne aktiv ist.

**Keine Kollisionsprüfung bei Anzeigenamen — zwei „Anna" erscheinen ununterscheidbar** — `Publikum / Namen` · `api/index.js:396`
- **Problem:** `/identify` übernimmt jeden Namen ungeprüft; Rangliste/Q&A zeigen ihn 1:1.
- **Wirkung:** Zwei identische Namen-Zeilen wirken wie ein Doppel-Vote-Bug (nur bei aktiviertem „Namen erfassen").
- **Fix:** Bei Kollision disambiguieren („Anna (2)") oder eine stabile Kennung/Initialen-Badge ergänzen.

**Englische Guide-Version verwendet durchgehend deutsche „Anführungszeichen"** — `i18n / Anleitung` · `public/anleitung.html:124`
- **Problem:** Im GUIDE.en-Block stehen deutsche „…" statt englischer.
- **Wirkung:** Wirkt für englische Leser wie ein Tippfehler/deutscher Rest.
- **Fix:** In den betroffenen Stellen auf englische Anführungszeichen umstellen.

**Drag-Griffe sind role="button", aber weder fokussierbar noch tastaturbedienbar** — `Barrierefreiheit / Drag` · `public/presenter.html:546`
- **Problem:** `.slide-handle`/`.rank-handle` tragen `role="button"`+aria-label, aber kein tabindex/keydown (nur pointerdown). Funktionierende Tastatur-Alternativen (Hoch/Runter, ▲/▼) existieren.
- **Wirkung:** Screenreader kündigt eine „Schaltfläche" an, die bei Aktivierung nichts tut.
- **Fix:** `role="button"` entfernen (dekorativer Griff) oder tabindex + Enter/Leertaste-Handler ergänzen.

**Begriff „Event" statt „Präsentation" in Fehlermeldungen** — `Onboarding / Begriffe` · `public/i18n.js:179`
- **Problem:** `landing.join.errNotFound` und `vote.noEvent.*` nutzen „Event", der Rest durchgängig „Präsentation".
- **Wirkung:** Im Fehlerfall taucht plötzlich ein anderes Wort für dieselbe Sache auf.
- **Fix:** „Event"/„event" durch „Präsentation"/„presentation" ersetzen.

**Keine Auffindbarkeit von Hilfe/Tastenkürzeln innerhalb des Werkzeugs** — `Auffindbarkeit / Hilfe` · `public/presenter.html:13`
- **Problem:** Der Editor-Header verlinkt nicht auf /anleitung.html. (Die Präsentationsmodus-Shortcuts sind über den Hinweis „← → Folie · Esc beenden" aber bereits sichtbar dokumentiert.)
- **Wirkung:** Wer im Editor eine Frage hat, muss die App verlassen.
- **Fix:** Hilfe-Link ins Overflow-Menü des Editor-Headers aufnehmen.

**Nicht separat verifizierte Low-Findings (Politur, gebündelt):**

- **Meine Präsentationen synchronisiert nicht zwischen Tabs** — `public/index.html:207`: `renderMine()` liest `puls.mine` nur beim Laden; kein `storage`-Event-Listener. → In Tab B taucht eine in Tab A neu erstellte Präsentation erst nach Reload auf. Fix: `storage`-Listener registrieren.
- **Identische Optionstexte verschmelzen in der Verlaufstabelle** — `public/presenter.html:480`: `addLabels()` dedupliziert nach Text, `valOf()` per `indexOf` → die zweite gleichnamige Option fehlt im Vergleich. Fix: Trends per Options-Index statt Text zuordnen.
- **Schnelles Doppelklicken auf „Weiter"/„Zurück" verschluckt** — `public/presenter.html:1034`: beide Klicks berechnen denselben Zielindex aus dem veralteten Snapshot (vgl. high-Fund zur Poll-Verzögerung). Fix: `activeIndex` optimistisch mitführen.
- **Ranking-Drag verliert beim Zeilenwechsel die Hervorhebung** — `public/vote.html:787`: `render()` baut die Liste per `innerHTML=''` neu, ohne `.dragging` zu übertragen. Fix: `.dragging` nach jedem render() auf die aktuelle Zeile setzen.
- **Generische Abstimmungsfehler nutzen den falsch benannten Schlüssel `vote.name.err`** — `public/vote.html:462`: buildChoice/buildScale zeigen den Namens-Fehlertext bei generischen Submit-Fehlern. Fix: eigenen `vote.submit.err`-Key.
- **Reaktions-Tap gibt keine bleibende Rückmeldung; Fehler unsichtbar** — `public/common.js:171`: `sendReaction()` ist Fire-and-Forget mit `.catch(()=>{})`. Fix: kurze bleibende Bestätigung; 4xx optisch von Latenz trennen.
- **Nicht-ganzzahlige Skala-Antworten fehlen in der XLSX-Verteilungstabelle, zählen aber im Durchschnitt** — `lib/domain.mjs:263`: nur `isFinite`+Range-Check. Fix: zusätzlich `Number.isInteger` prüfen/runden.
- **Zu grosse Request-Bodies werden auf Vercel lautlos zu leerem Objekt** — `api/index.js:212`: `readJson()` resolved bei >100 KB zu `{}` → irreführender „slides_missing". Fix: explizit 413/`body_too_large` zurückgeben (analog server.js).
- **Datenschutzangabe zur Namenslöschung stimmt nur für den Komplett-Reset** — `public/datenschutz.html:52`: Einzel-Folien-Reset lässt `pres.names` unangetastet. Fix: Formulierung auf „wenn alle Antworten zurückgesetzt werden" präzisieren.
- **Durchschnittswerte immer mit Punkt statt Komma** — `public/common.js:391`: `toFixed()` ignoriert die UI-Sprache. Fix: `Intl.NumberFormat` je `getLang()`.
- **Wort „Code" in Kopfzeilen läuft nicht über i18n** — `public/vote.html:98`: fester String `'Code '`. Fix: i18n-Key `common.codeLabel`.
- **Quiz-/Bestätigungs-Rückmeldungen laufen nicht über eine aria-live-Region** — `public/vote.html:503`: kein `aria-live` im Projekt. Fix: Feedback-Container `aria-live="polite" aria-atomic="true"`.
- **Keine prefers-reduced-motion-Berücksichtigung** — `public/app.css:496`: fliegende Emojis/Spinner/Puls laufen unbedingt. Fix: `@media (prefers-reduced-motion: reduce)` ergänzen.
- **Quiz-Rangliste ohne definierte Tie-Break-Regel** — `lib/domain.mjs:344`: bei Gleichstand entscheidet die Einfügereihenfolge. Fix: Zeitstempel der letzten/ersten richtigen Antwort als 3. Kriterium.
- **Markenkopfzeile zeigt auf den drei Seiten unterschiedliche Unterzeilen** — `public/vote.html:14`: „PULS Live-Umfragen" / „PULS Moderation" / nur „PULS". Fix: kurzen i18n-Zusatz (z. B. „Abstimmen") auf vote.html.
- **Live-Vorschau-iframe behält deutschen title-Tooltip in der englischen UI** — `public/presenter.html:218`: statisches `title="Live-Vorschau"`. Fix: `data-i18n-title` setzen.
- **Deutsche Anführungszeichen mit geradem Schlusszeichen** — `public/i18n.js:43`: `mailBody`, `laterHint`, `quizHint` schliessen mit `"` statt `"`. Fix: schliessendes deutsches Anführungszeichen vereinheitlichen.
- **Reaktions-Puffer global auf 60 Einträge gedeckelt statt pro Zeitfenster** — `api/index.js:363`: `slice(-60)` schneidet noch gültige Reaktionen ab. Fix: nur nach Alter filtern oder Grenze deutlich höher (z. B. 300).
- **Kein Auto-Fokus auf das Fragefeld nach Auswahl eines Folientyps** — `public/presenter.html:899`: Fokus liegt auf `<body>`. Fix: nach `renderSlideEditor()` `$('slideQuestion').focus()`.

---

## ✅ Empfohlene Reihenfolge (Top 10)

1. **Moderations-Warteschlange von der projizierten Bühne trennen** (critical) — verhindert das schlimmste Live-Leak; separater Presenter-View oder ausblendbares Panel.
2. **Rate-Limits auf `/join`, `/answers`, `/react`, `/upvote`, `/identify`** (critical) — stoppt Brute-Force der Codes und Live-Spam in Wortwolke/Q&A; zugleich Basis gegen Ballot-Stuffing.
3. **Steuerzeichen in Freitext filtern** (critical) — macht den XLSX-Export wieder verlässlich; `clampText()` zentral säubern + Test.
4. **Indexbasierte Stimmenzuordnung absichern** (critical/high) — Optionen löschen/leeren/Typwechsel dürfen bestehende Stimmen nicht verschieben; serverseitig `answers` bei Options-/Typänderung zurücksetzen (mit Warnung) oder Options-IDs einführen.
5. **Teilnehmerzähler auf Vercel echt machen (oder ausblenden)** (high) — beseitigt das dauerhaft sichtbare „0 Personen" auf der Beitritts-Bühne.
6. **Sofortiges Feedback für Weiter/Zurück/Sperren/Ausblenden** (high) — optimistisches Update/Sofort-Refetch + Pending-Zustand; behebt die ~1,5 s Verzögerung und den verschluckten Doppelklick.
7. **`overflow-wrap`/`min-width:0` gegen Layout-Brüche** (high) — `.vote-question`, `.cloud-word`, `.editor-layout`-Grid-Items und Balken-Labels; verhindert zerschossene Handy- und Beamer-Anzeige durch normale lange Wörter.
8. **Ergebnis-Füllung von der „selected"-Farbe entkoppeln** (high) — `.selected` vor der Ergebnisansicht entfernen; die eigene führende Antwort/Skala zeigt wieder einen sichtbaren, korrekten Balken.
9. **Robuste Fehler-/Ladezustände im Abstimm- und Beitritts-Flow** (high) — `onErr` in allen vier `submit()`-Aufrufen, defensiver `localStorage`-Zugriff in `vote.html`, 404 vs. Netzfehler unterscheiden, Buttons während Requests deaktivieren; verhindert lautlosen Stimmverlust und „Verbinde …"-Einfrieren.
10. **Vollbild-Übergang + Autosave-Sicherheit vor „Präsentieren"** (high) — `requestFullscreen()` synchron im Klick (Admin-Token nicht sichtbar), bei fehlgeschlagenem Save vor dem Live-Schalten warnen, `beforeunload`-Flush für ausstehende Editor-Änderungen.