# BeamMP Server Manager

Desktop-Verwaltungssoftware fuer BeamMP-Server mit Angular + Electron.

## Features

- Mehrere Serverprofile mit eigenen Ports, Arbeitsverzeichnissen und Exe-Pfaden
- Bearbeiten von BeamMP-Einstellungen (Name, AuthKey, Map, MaxPlayers, Tags)
- Automatisches Schreiben von `ServerConfig.toml` und ENV-Overrides (`BEAMMP_*`)
- Mod-Management ueber `Resources/Client` (`.zip` aktiv, `.zip.disabled` inaktiv)
- Map-Auswahl (Standard-Maps + erkannte Maps aus Modnamen)
- Prozesssteuerung (Start/Stop) und Monitoring (Status, PID, CPU, RAM, Uptime, Logs)
- Windows-Installer als `.exe` via NSIS (`electron-builder`)

## Offizielle Referenzen

- BeamMP Server Manual: https://docs.beammp.com/server/manual/
- BeamMP Server Setup: https://docs.beammp.com/server/create-a-server/
- Angular Dokumentation: https://angular.dev/docs

## Voraussetzungen

- Windows 10/11
- Node.js 20+
- BeamMP-Server-Binary (`BeamMP-Server.exe`) pro Serverprofil

## Entwicklung

```bash
npm install
npm run dev
```

`npm run dev` startet Angular Dev-Server und Electron zusammen.

## Produktion Build

```bash
npm run build
```

Frontend-Artefakte landen in `dist/beammp-sm/browser`.

## Installer erstellen

```bash
npm run dist
```

Installer-Ausgabe:

- `release/BeamMP-Server-Manager-0.1.0-Setup.exe`

## Nutzung

1. Neues Serverprofil erstellen.
2. Working Directory waehlen (enthaelt BeamMP Serverdaten).
3. Optional eigene `BeamMP-Server.exe` waehlen.
4. AuthKey/Port/Map/MaxPlayers setzen und speichern.
5. Mods in `Resources/Client` ablegen und aktivieren/deaktivieren.
6. Server starten und Monitoring live beobachten.

## Hinweise

- Die Working Directory bestimmt laut BeamMP-Doku, wo `ServerConfig.toml`, Logs und `Resources` erstellt/geladen werden.
- Ports muessen pro Serverprofil eindeutig sein.
- Beim ersten Lauf kann der BeamMP-Server seine Ordnerstruktur selbst erzeugen.
