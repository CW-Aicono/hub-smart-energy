---
name: layman-instructions-policy
description: Der Nutzer ist Laie und braucht bei Server-, Hetzner-, Docker-, Datenbank-, Live-/Staging- und Update-Themen immer eine Schritt-für-Schritt-Anleitung ohne Fachjargon.
type: preference
---

## Regel

Bei allen Themen rund um Hetzner, Live-System, Test-System, Docker, Worker, Datenbank, Edge Functions, Deployments, Updates, Keys, Putty, Server oder Infrastruktur immer davon ausgehen, dass der Nutzer Laie ist.

## Wie antworten

- Immer zuerst in Alltagssprache erklären, **was passiert ist**.
- Begriffe wie „Live-Env“, „Backend“, „Container“, „Deployment“, „DB“, „Edge Function“ nur verwenden, wenn sie direkt erklärt werden.
- Immer klar sagen: **Musst du etwas tun? Ja/Nein.**
- Wenn der Nutzer etwas tun muss: nummerierte Schritte mit Copy/Paste-Befehlen und erwarteter Ausgabe.
- Keine Abkürzungen ohne Erklärung.
- Nicht schreiben „manuell in der Datenbank ändern“, ohne exakt zu sagen, wer das tun kann und wie es sicher gemacht wird.
- Wenn möglich erklären, warum es nicht automatisch geht.
- Bei Fehleranalyse niemals raten; erst verifizieren, dann handeln.

## Beispiel-Standard

Statt „Live-Env korrigieren“ schreiben:

„Damit meine ich: die echte AICONO-Webseite, die eure Kunden benutzen. Diese läuft auf eurem Hetzner-Server, nicht hier in Lovable. Ich kann hier nur die Test-Daten ändern. Für die echte Seite muss entweder der Hetzner-Zugang über die AICONO-Oberfläche gespeichert werden oder jemand mit Server-Zugriff muss den folgenden kopierbaren Befehl ausführen.“
