# PULS — Audit, kompakt & entdoppelt (2026-07-06)

116 einzigartige offene Findings nach Entdopplung: 34 high / 54 medium / 28 low. Ursprünglich 128 roh (109 confirmed + 19 low); 12 Findings entfernt/zusammengeführt (4 Criticals bereits behoben inkl. 3 Beinah-Duplikate, plus 5 weitere Duplikat-Paare verschmolzen).

## ✅ Bereits behoben (4 Criticals)
- **#1 Q&A-Moderationswarteschlange auf dem Beamer** — Bühnenpanel zeigt nur noch einen Zähler; Fragetext erst nach Taste „M" mit Warnhinweis „⚠ Für das Publikum sichtbar" (presenter.html/app.css/i18n.js).
- **#2 Fehlende Rate-Limits** — Sliding-Window-Limit (60/10s je IP je Endpunkt) auf /join, /answers, /upvote, /react, /identify, in server.js UND api/index.js.
- **#3 Steuerzeichen zerstören XLSX-Export** — clampText + xmlEsc entfernen XML-1.0-unzulässige Steuerzeichen (lib/domain.mjs, server.js).
- **#4 Option löschen verschiebt Stimmen** — neuer Helfer `answersRemainValid`: indexbasierte Antworten werden bei Options-/Typ-/Skalen-/Quiz-Schlüssel-Änderung serverseitig verworfen statt verschoben (deckt auch Folientyp-Wechsel und Quiz-Schlüssel-Änderung während laufender Abstimmung ab; beide Runtimes).

## 🔴 Hoch — vor der Demo (high)

### Onboarding
- **Beitreten nach Zurück-Button dauerhaft tot** — `Onboarding/Beitritt` · `public/index.html:91` — `joining`-Flag auch bei Erfolg zurücksetzen + `pageshow`/bfcache-Reset ergänzen.
- **QR-Code zeigt unerreichbare VPN/Docker-Adresse statt WLAN-IP** — `Onboarding/QR (Self-Hosted)` · `server.js:1065` — Interfaces filtern (WLAN vor VPN/Docker), private Adressen bevorzugen.

### Editor
- **Kein beforeunload-Schutz beim Autosave** — `Editor/Autosave-Timing` · `public/presenter.html:512` — Bei pagehide/beforeunload ausstehende Änderungen per sendBeacon flushen oder warnen.
- **Editor selbst bricht auf Tablet/Handy auseinander** — `Editor/Folienbearbeitung` · `public/app.css:102` — `min-width:0` auf die Grid-Spalten von `.editor-layout` setzen.
- **Zwei offene Editor-Tabs überschreiben sich komplett** — `Editor/Nebenläufigkeit` · `api/index.js:488` — Versionsnummer/`updatedAt` einführen, PUT bei Konflikt mit 409 ablehnen.
- **Skala-Standardbeschriftungen hartcodiert Deutsch** — `Editor/Skala` · `lib/domain.mjs:46` — Labels leer lassen, Default clientseitig per i18n je UI-Sprache rendern.

### Präsentationsmodus
- **Teilnehmerzähler zeigt auf Vercel dauerhaft „0 Personen"** — `Präsentationsmodus/Beitritts-Bühne` · `api/index.js:173` — Zähler aus echtem Redis-Set ableiten statt konstant 0.
- **Reset-Aktionen ohne jede Fehlerbehandlung** — `Präsentationsmodus/Datenverwaltung` · `public/presenter.html:954` — try/catch + alertDialog wie beim Archivieren ergänzen.
- **„Präsentieren" startet trotz fehlgeschlagenem Autosave** — `Präsentationsmodus/Live-Start` · `public/presenter.html:993` — saveNow() Erfolg/Misserfolg zurückgeben, bei Fehlschlag warnen statt stillschweigend starten.
- **Q&A-Freigabe-Panel bleibt nach Verlassen der Beitritts-Bühne leer** — `Präsentationsmodus/Q&A-Moderation` · `public/presenter.html:1120` — `refreshModeration()` nach `applyStagePresence()` erneut aufrufen.
- **Self-Paced: Ausblenden/Sperren wirkt global statt pro Folie** — `Präsentationsmodus/Self-Paced` · `api/index.js:179` — resultsHidden/votingLocked pro Folie statt global speichern.
- **Kein sofortiges Feedback nach Weiter/Zurück/Sperren** — `Präsentationsmodus/Steuerung` · `public/presenter.html:1039` — Nach setState() sofort Snapshot nachladen statt auf Poll zu warten.
- **„Präsentieren" geht bei Netzwerk-Verzögerung nicht ins Vollbild (Admin-Token in URL sichtbar)** — `Präsentationsmodus/Übergang` · `public/presenter.html:993` — requestFullscreen() synchron im Klick-Handler aufrufen, vor jedem await.

### Publikum / Abstimmen
- **Stimmabgabe schlägt bei vier Folientypen lautlos fehl** — `Publikum/Abstimmen` · `public/vote.html:432` — onErr-Handler in allen vier submit()-Aufrufen ergänzen.
- **Blockierter localStorage lässt vote.html abstürzen** — `Publikum/Abstimmen` · `public/vote.html:48` — participantId() defensiv mit try/catch + In-Memory-Fallback machen.
- **Sticky Bestätigen-Leiste ignoriert mobile Bildschirmtastatur** — `Publikum/Eingabe` · `public/app.css:551` — Per `visualViewport`-Resize-Listener aktiv positionieren.
- **Quiz zeigt Teilnehmenden die richtige Antwort nie** — `Publikum/Quiz` · `public/common.js:308` — Copy anpassen oder Korrekt-Index nach Freigabe durchreichen.
- **„Abstimmung gesperrt"-Hinweis nur 1,95:1 Kontrast** — `Publikum/Sperr-Status` · `public/app.css:558` — Dunklere Textfarbe auf Warn-Hintergrund für ≥4,5:1.
- **Lange, leerzeichenlose Wörter sprengen Frage & Wortwolke horizontal** — `Publikum/Wortwolke` · `public/app.css:254` — `overflow-wrap: anywhere` ergänzen.

### Ergebnis-Darstellung
- **Lange Optionstexte zerreißen Balkendiagramm-Ausrichtung** — `Beamer-Lesbarkeit` · `public/app.css:390` — Label auf 2 Zeilen begrenzen oder an erster Zeile ausrichten.
- **Ergebnis-Füllung kollidiert mit „ausgewählt"-Farbe** — `Publikum/Ergebnis-Darstellung` · `public/app.css:574` — „Eigene Wahl" nur über Outline kennzeichnen, nie über konkurrierende Füllfarbe.

### API & Backend
- **Admin-Token nie rotier-/widerrufbar** — `API/Backend – Auth` · `public/index.html:224` — Rotations-/Widerrufs-Endpunkt ergänzen.
- **Teilnehmer-ID frei wählbar — Ballot-Stuffing** — `API/Backend – Datenintegrität` · `api/index.js:297` — Signierten Teilnehmer-Token beim /join ausstellen und validieren.
- **activeIndex ist nur ein Array-Index** — `API/Backend – Live-Bearbeitung` · `api/index.js:502` — Beim Speichern anhand Folien-ID neu auflösen statt nur Zahlenwert zu begrenzen.
- **Lock-Notausgang führt zu garantiertem Stimmenverlust** — `API/Backend – Nebenläufigkeit` · `api/index.js:127` — Bei Lock-Erschöpfung mit 503/429 ablehnen statt ungeschützt zu schreiben.
- **Create-Rate-Limit per gefälschtem X-Forwarded-For umgehbar** — `API/Backend – Rate-Limiting` · `server.js:76` — Letzten (nicht ersten) XFF-Eintrag verwenden, vertrauenswürdige Hops konfigurierbar machen.

### Export
- **server.js dupliziert komplette Domänen-/Export-Logik statt lib/domain.mjs zu importieren** — `Export/Architektur` · `server.js:934` — Auf Import umstellen; bis dahin CI-Divergenztest ergänzen. *(offenes Architekturthema, siehe Hinweis unten)*
- **PPTX verspricht „weitere Antworten in Excel" — fehlen dort ebenfalls** — `Export/Datenintegrität` · `lib/domain.mjs:143` — Kappungsgrenze im XLSX aufheben oder Warnzeile ergänzen.
- **Admin-Token im Klartext in klickbarer Export-URL** — `Export/Datenschutz` · `public/presenter.html:395` — Export per POST+Header-Token statt Query-String-Link auslösen.
- **Löschen der korrekten Quiz-Option springt unbemerkt auf Option 1** — `Export/Quiz` · `public/presenter.html:696` — Bei Löschen der korrekten Option aktiv zur Neu-Auswahl auffordern.
- **Excel-/PowerPoint-Export immer Deutsch** — `Export/i18n` · `public/pptx-export.js:30` — Label-Strings durch Locale-Wörterbücher ersetzen, Sprache mitgeben.

### Barrierefreiheit & Fehlerbehandlung
- **Dialoge fangen Tastaturfokus nicht ein** — `Barrierefreiheit/Dialoge` · `public/presenter.html:781` — Fokus-Trap (Tab/Shift+Tab zyklisch) ergänzen, Fokus beim Schließen zurückgeben.
- **404 vs. Netz-Hänger nie unterschieden — Bühne friert ein** — `Fehlerbehandlung & Ausfallsicherheit` · `public/common.js:62` — 404 explizit erkennen, eigenen „gone"-Zustand mit klarer Meldung zeigen.

### Datenschutz
- **Datenschutzhinweis beschreibt nur Vercel/Upstash-Variante** — `Datenschutz` · `public/datenschutz.html:62` — Text je Runtime dynamisch rendern oder zwei Varianten pflegen.

## 🟡 Mittel (medium)

### API & Backend
- **participantId als Objekt-Schlüssel — Prototype-Kollision bricht Quiz-Check** — `Eingabevalidierung` · `lib/domain.mjs:296` — Positivliste prüfen, `Object.create(null)` bzw. `hasOwnProperty` verwenden.
- **Archivieren während offener Abstimmung sortiert Stimmen falsch ein** — `Nebenläufigkeit` · `api/index.js:556` — Vor Archivieren automatisch votingLocked=true setzen.
- **Emoji-Reaktionen erzwingen volles Read-Modify-Write unter Stimmen-Lock** — `Performance` · `api/index.js:353` — Reaktionen in eigenem Redis-Key mit TTL führen.
- **In-Memory-Fallback ohne Redis lautlos und inkonsistent** — `Persistenz` · `api/index.js:41` — hasRedis=false explizit signalisieren und im UI warnen.
- **Kein Graceful Shutdown im Hetzner-Server** — `Persistenz (Self-Hosted)` · `server.js:53` — SIGTERM/SIGINT-Handler, der saveStore sofort flusht.
- **Redis-Lock ohne Besitz-Token — DEL kann fremdes Lock aufheben** — `Race-Conditions` · `api/index.js:116` — Zufalls-Token pro Lock + atomares GET+DEL per Lua-Skript.
- **Globale Präsentations-Obergrenze fehlt im Vercel-Pfad** — `Ressourcenschutz` · `api/index.js:23` — Weiche Obergrenze per Cron/Zähler-Key ergänzen.
- **Self-gehosteter Server sendet keine Sicherheits-Header** — `Sicherheit` · `server.js:539` — CSP/X-Frame-Options/Referrer-Policy aus vercel.json übernehmen.
- **CSP erlaubt 'unsafe-inline' — kein echter XSS-Schutz** — `Sicherheit & Datenschutz` · `vercel.json:20` — Nonce/Hash-basierte CSP einführen, Inline-Skripte auslagern.
- **Gemeinsamer api()-Helfer hat kein Request-Timeout** — `Fehlerbehandlung/Architektur` · `public/common.js:24` — AbortController mit 8-10s Timeout ergänzen.

### Editor
- **Antwortoptionen bis auf 0 löschbar** — `Antwortoptionen` · `public/presenter.html:692` — Entfernen-Button ab Mindestanzahl deaktivieren, serverseitig leere Optionen verhindern.
- **Doppelte Optionstexte ungeprüft — verfälscht Quiz-Korrektheit und lässt Trends-Zeilen verschmelzen** — `Antwortoptionen` · `lib/domain.mjs:56` — Beim Speichern auf normalisierte Duplikate prüfen; Trends auf Options-Index statt Text umstellen.
- **Fehlgeschlagenes Autosave nur unauffälliger Text, kein Retry** — `Autosave` · `public/presenter.html:522` — Automatischer Retry mit Backoff + beforeunload-Warnung.
- **PowerPoint-Exportfehler zeigt rohen JS-Fehlertext** — `Export-Fehlermeldungen` · `public/presenter.html:943` — Bekannte Ursachen auf übersetzte Meldungen abbilden.
- **50-Folien-Obergrenze lautlos abgeschnitten** — `Folienverwaltung` · `api/index.js:495` — btnAddSlide deaktivieren, Server soll Fehler statt stillem Kürzen liefern.
- **Kein Kopieren-Button für Zugangscode/Link im Editor** — `Publikums-Zugang` · `public/presenter.html:34` — Bestehenden Copy-Button-Baustein wiederverwenden.
- **Quiz-Antwortschlüssel defaultet still auf erste Option** — `Quiz` · `lib/domain.mjs:64` — `correct` initial auf -1/null, Warn-Badge im Editor bis explizit gewählt.
- **Zu kleine Tap-Ziele in Folien-/Optionsverwaltung** — `Touch-Bedienung` · `public/app.css:130` — `min-width/height: 44px` ergänzen.

### Präsentationsmodus
- **Quiz-Antwortschlüssel veraltet bei Bearbeitung im Zweit-Tab** — `Mehrere Tabs` · `public/presenter.html:1099` — Bei jedem Snapshot vollständige Foliendaten inkl. `correct` neu abrufen.
- **„Neue Sitzung starten" löscht auch unfreigegebene Q&A-Fragen unwiderruflich** — `Q&A & Sitzungsarchiv` · `lib/domain.mjs:365` — Fragen in sessionSummary() mitschreiben, Bestätigungsdialog kontextabhängig ergänzen.
- **Erneutes Ansteuern einer Quiz-Folie versteckt Ergebnisse & resettet Tempo-Bonus-Timer** — `Quiz` · `server.js:1345` (identisch api/index.js:518) — resultsHidden/startedAt nur beim allerersten Aktivieren setzen.
- **Reset/Archivieren setzt Tempo-Bonus-Timer nicht zurück — neue Antworten nur Mindestwert** — `Quiz-Timing` · `lib/domain.mjs:376` — `slide.startedAt` beim Zurücksetzen zusätzlich löschen.
- **Reload/Wiedereinstieg verwirft Präsentationszustand — zurück zu Editor bzw. QR-Bühne** — `Robustheit` · `public/presenter.html:995` — Presenting-Zustand + activeIndex in sessionStorage merken.
- **Self-Paced bleibt im Präsentationsmodus unsichtbar** — `Self-Paced` · `public/presenter.html:1060` — Deutlichen Hinweis/Badge „Selbststeuerung aktiv" einblenden.

### Publikum / Abstimmen & Quiz
- **Verbindungsstatus nirgends angezeigt — App friert bei Netzausfall lautlos ein** — `Abstimmen` · `public/vote.html:120` — onStatus-Callback anschließen, „Verbindung wird wiederhergestellt" anzeigen.
- **Bestätigen-Button bleibt während Anfrage aktiv — Doppel-Tap verfälscht Quiz-Feedback** — `Abstimmen` · `public/vote.html:360` — Button sofort beim Klick deaktivieren.
- **Reset/Archivieren löscht Namen serverseitig, Client merkt es nie** — `Abstimmen` · `server.js:1371` — pres.names beim Reset nicht löschen (Namen sind pro Person).
- **„Namen erfassen" nachträglich aktiviert reißt Teilnehmer aus Eingabe** — `Abstimmen` · `public/vote.html:136` — Namens-Gate nur bei Folienwechsel einblenden, nicht rückwirkend.
- **Tempo-Bonus beim Quiz unsichtbar für Teilnehmer** — `Abstimmen` · `public/vote.html:509` — Sichtbaren Countdown/Fortschrittsbalken synchron zu startedAt ergänzen.
- **„Bereits abgestimmt" nur in sessionStorage — verschwindet bei Tab-Schließen** — `Abstimmen` · `public/vote.html:75` — votedStore zusätzlich in localStorage führen.
- **Ausgewählte Option nur visuell markiert — kein aria-pressed/checked** — `Abstimmen` · `public/vote.html:452` — aria-pressed bzw. role="radio"+aria-checked mitführen.
- **Kein Doppel-Submit-Schutz bei offener Frage/Wortwolke** — `Abstimmen` · `public/vote.html:614` — Bei Klick sofort synchron sperren bis Serverantwort da ist.
- **Fehlgeschlagener Beitritt zeigt immer „Kein aktives Event", auch bei Netzfehler** — `Beitritt` · `public/vote.html:121` — Netzwerkfehler von echtem 404 unterscheiden, Retry-Button zeigen.
- **Kein Hinweis auf 5-Antworten-Limit bei offener Frage/Q&A** — `Offene Frage & Q&A` · `public/vote.html:602` — „Noch X von 5"-Hinweis analog Wortwolke ergänzen.
- **100-Punkte-Verteilung bricht bei langen Optionsbezeichnungen auf schmalen Screens** — `Punkte-Verteilung` · `public/app.css:289` — Layout auf schmalen Screens zweizeilig stapeln.
- **Beantwortete Quiz-Optionen wirken weiter aktiv, falsche Antwort wie normale Auswahl** — `Quiz` · `public/vote.html:517` — disabled/is-locked-Klasse + eigene Kennzeichnung für falsche Antwort.
- **Rangliste zeigt hartcodierten deutschen Platzhalter „Gast"** — `Quiz-Rangliste` · `lib/domain.mjs:342` — Fallback-Label über i18n.js lösen.
- **Reaktions-Buttons alle mit identischem aria-label** — `Reaktionen` · `public/vote.html:193` — Pro Emoji unterscheidbares aria-label vergeben.
- **Reaktions-Buttons unter 44px Touch-Zielgröße** — `Reaktionen` · `public/app.css:484` — min-height/width: 44px ergänzen.
- **Self-Paced-Position nur Array-Index — Folie löschen zeigt falsche Folie dauerhaft** — `Self-Paced` · `public/vote.html:56` — Position an slide.id statt Array-Index binden.
- **Anrede wechselt unvermittelt Sie/Du** — `Tonalität` · `public/i18n.js:217` — Beide Strings auf Sie-Form vereinheitlichen.
- **Wortwolken-Zählung durch Mehrfach-Einreichen manipulierbar** — `Wortwolke` · `lib/domain.mjs:122` — Pro Teilnehmer nur einen Zähl-Beitrag je Wort zulassen.

### Barrierefreiheit & Datenschutz
- **Fehlermeldungen von Beitritt/Erstellen nicht per Screenreader angekündigt** — `Barrierefreiheit` · `public/index.html:39` — `aria-live="polite"` auf Error-Container.
- **Grauer Hilfe-/Meta-Text unter WCAG-AA-Kontrast** — `Kontrast` · `public/design-system.css:20` — Grauton abdunkeln (≥4,5:1) für Fließtext.
- **QR-Codes ohne zugänglichen Namen** — `QR-Codes` · `public/common.js:467` — role="img" + sprechendes aria-label ergänzen.
- **Datenschutzhinweis verschweigt Namensanzeige in öffentlicher Quiz-Rangliste** — `Datenschutz` · `public/datenschutz.html:49` — Namensanzeige in Rangliste in der Aufzählung ergänzen.

### Sonstiges (Onboarding, Meine Präsentationen, Branding, i18n)
- **„Meine Präsentationen" nie bereinigbar — keine Lösch-/Umbenennen-Funktion** — `Meine Präsentationen` · `public/index.html:216` — „Entfernen"-Button pro Eintrag ergänzen.
- **Lange Präsentationstitel brechen Layout in „Meine Präsentationen"** — `Darstellung` · `public/app.css:96` — `overflow-wrap: anywhere` ergänzen.
- **Verlust des Moderationslinks ist endgültig trotz versprochener Wiederauffindbarkeit** — `Session-Wiederherstellung` · `public/index.html:134` — Link wiederherstellbar machen oder Hinweistext ehrlich formulieren.
- **Keine Ladeanzeige bei Teilnehmen/Erstellen** — `Ladezustände` · `public/index.html:38` — Button bei Submit deaktivieren, Ladezustand zeigen.
- **Kein Doppel-Submit-Schutz beim Erstellen** — `Präsentation erstellen` · `public/index.html:126` — `creating`-Flag wie beim Join-Flow einführen.
- **Anleitung zeigt alte Editor-UI vor A–D-Redesign** — `Anleitung` · `public/anleitung.html:93` — Screenshots/Texte gemäß vorliegendem Plan aktualisieren.
- **Wortwolke ignoriert individuelle Markenfarbe** — `Branding` · `public/common.js:364` — Farbsequenz aus `--primary` ableiten statt Standardpalette.
- **Fest codierter Platzhaltertitel „Unbenannte Präsentation" auch in EN-UI** — `i18n` · `server.js:162` — Fallback-Titel sprachabhängig oder neutral gestalten.

## ⚪ Niedrig / Politur (low)

### Barrierefreiheit
- **Keine prefers-reduced-motion-Berücksichtigung** — `public/app.css:496` — Media-Query reduziert Animationen auf Ein-/Ausblenden.
- **Drag-Griffe role="button" aber nicht fokussierbar/tastaturbedienbar** — `public/presenter.html:546` — tabindex+Enter/Leertaste-Handler oder role entfernen.
- **Quiz-/Bestätigungs-Feedback ohne aria-live-Region** — `public/vote.html:503` — Container mit `aria-live="polite"` versehen.

### Editor
- **SVG-Logo-Upload meldet Erfolg, wird aber nie gespeichert** — `api/index.js:452` — Format serverseitig prüfen, bei Fehlschlag 400 statt 200.
- **Kein Auto-Fokus auf Fragefeld nach neuer Folie** — `public/presenter.html:899` — Fragefeld nach Anlegen automatisch fokussieren.
- **Live-Vorschau-iframe behält deutschen Tooltip in EN-UI** — `public/presenter.html:218` — `data-i18n-title` ergänzen.

### Export
- **Zeitstempel ohne Zeitzone — auf Vercel UTC statt Ortszeit** — `lib/domain.mjs:660` — TZ explizit setzen oder UTC-Kennzeichnung ergänzen.
- **Nicht-ganzzahlige Skala-Antworten fehlen in XLSX-Verteilung** — `lib/domain.mjs:263` — Number.isInteger prüfen oder runden.

### Präsentationsmodus
- **exitPresent() lädt Editor ohne Fehlerbehandlung neu** — `public/presenter.html:1031` — `.catch()` + Retry-Meldung ergänzen.
- **Doppelklick auf Weiter/Zurück wird während Poll-Verzögerung verschluckt** — `public/presenter.html:1034` — activeIndex optimistisch mitführen oder Buttons kurz debouncen.
- **Escape beendet Live-Modus sofort ohne Rückfrage** — `public/presenter.html:1164` — Kurze Bestätigung vor exitPresent() einbauen.

### Publikum
- **Ranking-Drag verliert Hervorhebung beim Überqueren einer Zeile** — `public/vote.html:787` — dragging-Klasse nach jedem render() neu zuweisen.
- **Generischer Fehler nutzt falsch benannten i18n-Schlüssel „vote.name.err"** — `public/vote.html:462` — Eigenen Schlüssel `vote.submit.err` einführen.
- **Reaktions-Tap ohne bleibende Rückmeldung bei Fehlschlag** — `public/common.js:171` — Kurze Bestätigung + Fehlerunterscheidung ergänzen.
- **Keine Kollisionsprüfung bei Anzeigenamen** — `api/index.js:396` — Bei Kollision automatisch disambiguieren (z. B. „Anna (2)").
- **Reaktions-Puffer global auf 60 gedeckelt statt pro Zeitfenster** — `api/index.js:363` — Kappung nach Alter statt absoluter Obergrenze.

### Sonstiges (i18n, Onboarding, API)
- **Zu große Request-Bodies werden auf Vercel lautlos leer** — `api/index.js:212` — Expliziten 413/400-Fehler statt leerem Objekt zurückgeben.
- **Keine Auffindbarkeit von Hilfe/Tastenkürzeln im Tool** — `public/presenter.html:13` — Hilfe-Link im Overflow-Menü ergänzen.
- **Deutsche Anführungszeichen mit falschem Schlusszeichen** — `public/i18n.js:43` — Schließendes „"" vereinheitlichen.
- **Datenschutzangabe zu Namenslöschung stimmt nur für Komplett-Reset** — `public/datenschutz.html:52` — Formulierung präzisieren.
- **Quiz-Rangliste ohne Tie-Break-Regel bei Punktegleichstand** — `lib/domain.mjs:344` — Zeitstempel der letzten richtigen Antwort als drittes Kriterium.
- **Durchschnittswerte immer mit Punkt statt Komma** — `public/common.js:391` — Intl.NumberFormat je nach Sprache verwenden.
- **Markenkopfzeile zeigt auf drei Seiten unterschiedliche Unterzeilen** — `public/vote.html:14` — Kurzen i18n-Zusatz auch auf vote.html ergänzen.
- **„Meine Präsentationen" synchronisiert nicht zwischen Tabs** — `public/index.html:207` — `storage`-Event-Listener auf `puls.mine` registrieren.
- **Begriff „Event" statt „Präsentation" in Fehlermeldungen** — `public/i18n.js:179` — Terminologie vereinheitlichen.
- **429-Rate-Limit beim Erstellen zeigt irreführende Server-Meldung** — `public/index.html:138` — Eigene 429-Meldung statt generischem Fehlertext.
- **Englische Anleitung nutzt deutsche Anführungszeichen** — `public/anleitung.html:124` — Auf englische Anführungszeichen umstellen.
- **Wort „Code" in Kopfzeilen läuft nicht über i18n** — `public/vote.html:98` — i18n-Key (z. B. `common.codeLabel`) einführen.
