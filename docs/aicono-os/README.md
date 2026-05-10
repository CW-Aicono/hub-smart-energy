# AICONO Hub OS – Image-Build-Pipeline

Erzeugt vorkonfigurierte HAOS-Images, in denen unser
`aicono-ems-gateway`-Add-on bereits installiert ist und beim ersten Boot
den Captive-Setup-Wizard (`/setup`, mDNS `aicono.local`) startet.

## Repo-Layout (Ziel: `CW-Aicono/aicono-os`)

```
aicono-os/
├── .github/workflows/build-image.yml   ← Build & Release
├── overlay/
│   ├── etc/hostname                    ← "aicono"
│   ├── etc/avahi/services/aicono.service
│   └── usr/share/hassio/addons/local/aicono-ems-gateway/   ← geclonter Add-on
├── scripts/
│   ├── inject-addon.sh                 ← entpackt HAOS, kopiert overlay/, packt neu
│   └── verify-image.sh                 ← QEMU-Boot + Healthcheck
└── README.md
```

## Hardware-Matrix

| Variante                  | HAOS-Asset                              | Endgeräte                       |
| ------------------------- | --------------------------------------- | ------------------------------- |
| **AICONO Hub Mini**       | `haos_generic-x86-64-*.img.xz`          | Intel N100 Mini-PC (~250–350 €) |
| **AICONO Hub Industrial** | `haos_generic-x86-64-*.img.xz`          | Onlogic K-100, RevPi Connect 4  |
| **AICONO Hub Home**       | `haos_yellow-*.img.xz` / `haos_green-*` | HA Yellow / HA Green (rebrand)  |
| **AICONO Hub ARM**        | `haos_rpi5-64-*.img.xz`                 | Raspberry Pi 5 + SSD            |

x86_64-Builds dienen Mini + Industrial (gleiches Image), aarch64-Builds
für Yellow/Green/Pi5.

## Distribution

- **GitHub Releases** im Repo `CW-Aicono/aicono-os` (öffentlich oder privat).
  Limit 2 GB / Asset reicht (HAOS komprimiert ~600 MB).
- Cloud löst signierte Download-URLs via Edge-Function
  `gateway-image-download` auf (Token `LOVABLE_API_KEY` /
  `HA_ADDONS_PUSH_TOKEN`, Repo-Read).
- Vorgeflashte Hardware: AICONO bezieht Images aus den gleichen Releases
  und flasht sie auf die ausgelieferte Hardware (Phase 2).

## Trigger

```bash
git tag v2026.05.0 && git push --tags
```

→ Workflow lädt aktuelles HAOS, mergt Overlay + Add-on, erstellt Release
mit allen Image-Varianten + SHA-256-Sums.

<!-- Sync-Test: aicono-os ready -->
