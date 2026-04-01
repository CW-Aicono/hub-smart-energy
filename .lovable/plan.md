

## Schneider Panel Server – TLS-Hinweis korrigieren (SHA256)

### Hintergrund

Der aktuelle TLS-Hinweis in `SchneiderSetupInfo.tsx` behauptet fälschlicherweise:
- **Firmware ≥ v3.x**: Zertifikatsvalidierung kann aktiviert bleiben
- **Firmware < v3.x**: Zertifikatsvalidierung muss deaktiviert werden (SHA384withECDSA)

**Realität**: Es gibt keine Firmware v3.x. Die aktuelle Version ist **v2.5.0**, und diese unterstützt SHA256-Zertifikate. Das Supabase-Endpoint-Zertifikat (Amazon/AWS) verwendet SHA256withRSA, was kompatibel ist.

### Änderung

**Datei: `src/components/integrations/SchneiderSetupInfo.tsx`** (Zeilen 98–111)

Den TLS-Infoblock ersetzen:
- Falsche v3.x-Referenz entfernen
- Klarstellen: Panel Server ab Firmware v2.x unterstützt SHA256 (RSA) – der Cloud-Endpunkt nutzt genau dieses Format
- Empfehlung: **Zertifikatsvalidierung aktiviert lassen** (Standard)
- Hinweis für sehr alte Firmware-Versionen (< v2.x): nur dann deaktivieren

**Datei: `src/lib/gatewayRegistry.ts`** – Keine Änderung nötig (rein UI-seitiger Fix)

### Technische Details

Neuer TLS-Hinweistext (sinngemäß):
- **TLS-Zertifikat**: Die Zertifikatsvalidierung kann **aktiviert bleiben**. Der Cloud-Endpunkt verwendet ein SHA256withRSA-Zertifikat (Amazon Trust), das vom Panel Server ab Firmware v2.x unterstützt wird.
- Nur bei sehr alter Firmware (< v2.0) ggf. deaktivieren.

