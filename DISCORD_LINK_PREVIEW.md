# Arcturus Discord Link Preview (Components V2 — Grand Edition)

This document explains the Discord Link Preview configuration for **[arcturusmc.org](https://www.arcturusmc.org/)**, implemented using Discord's **Component Embeds** ([Discord API Docs PR #8606](https://github.com/discord/discord-api-docs/pull/8606)).

---

## 1. Overview & Visual Architecture

When you share `https://arcturusmc.org/` or `https://www.arcturusmc.org/` on Discord, Discord's crawler detects the inline `<script id="discord:component-embed" type="application/json">` tag in `index.html`. It renders the preview as a grand, multi-section **Components V2 Container** with:

1. **Accent Color**: Electric Cyan (`#18cfdc` / decimal `1626076`) matching the Arcturus website primary brand color.
2. **Top Hero Banner (Type 12 Media Gallery)**: High-resolution moonlit spawn hero banner (`/images/arcturus-night.webp`).
3. **Decorative Dividers (Type 10 Text Display)**: Elegant icy crystal dividers (`❄️ ─── ❖ ─── ❄️ ─── ❖ ─── ❄️...`).
4. **Section with Logo Thumbnail (Type 9 Section + Type 11 Thumbnail Accessory)**:
   - Left side: Title, server description, quote banner, and aesthetic highlight tree (`payouts`, `enchants`, `petpvp`, `crossplay`).
   - Right side: Official server logo emblem (`/assets/logo.png`).
5. **Showcase Trailer Gallery (Type 12 Media Gallery)**: High-resolution official trailer poster (`/images/trailer.jpg`) with a clickable caption linking directly to the YouTube video (`https://www.youtube.com/watch?v=kPjvbbAWTJ0`).
6. **Server Stats Box (Type 10 Text Display)**: Styled Discord code block containing server IP, Bedrock port, version compatibility, FTop season info, and gameplay tags.
7. **Custom Animated Server Banner (Type 12 Media Gallery)**: Animated server banner (`/images/banner.gif` and `/images/banner.mp4`).
8. **Separator (Type 14)**: Clean spacing divider before buttons.
9. **Action Row 1 (Type 1 Action Row)**:
   - 🗳️ **Vote** &rarr; `https://www.arcturusmc.org/vote`
   - 🛒 **Store** &rarr; `https://store.arcturusmc.org`
   - 💬 **Discord** &rarr; `https://discord.gg/DTR6serkeM`
10. **Action Row 2 (Type 1 Action Row)**:
    - 🎬 **Watch Trailer** &rarr; `https://www.youtube.com/watch?v=kPjvbbAWTJ0`
    - 🌐 **Official Website** &rarr; `https://www.arcturusmc.org/`
11. **Bottom Decorative Divider (Type 10 Text Display)**: Closing icy divider.

---

## 2. The Complete JSON Payload (`discord-embed.json`)

The payload embedded inside `<script id="discord:component-embed" type="application/json">` in `index.html` is:

```json
{
  "component": {
    "type": 17,
    "accent_color": 1626076,
    "components": [
      {
        "type": 12,
        "items": [
          {
            "media": {
              "url": "https://www.arcturusmc.org/images/arcturus-night.webp"
            },
            "description": "ArcturusMC Moonlit Spawn"
          }
        ]
      },
      {
        "type": 10,
        "content": "❄️ ─── ❖ ─── ❄️ ─── ❖ ─── ❄️ ─── ❖ ─── ❄️ ─── ❖ ─── ❄️"
      },
      {
        "type": 9,
        "components": [
          {
            "type": 10,
            "content": "🌌 **Arcturus Factions & KitPvP** ⚔️\n*A next-gen competitive Minecraft network with smooth 1.8 PvP, custom cannons, pet combat, and a fair non-P2W economy.*\n\n> ✦ ──────── ⚡ **Arcturus Factions** ⚡ ──────── ✦\n> [ 1.8 Combat ] • [ Cracked & Bedrock ] • [ Non-P2W ]\n\n. - ∘ -: ✧ :-  **Server Highlights** -: ✧ :- ∘ - .\n├── 🏆 `payouts`  :: Monthly $100 FactionsTop PayPal rewards!\n├── ⚡ `enchants` :: Balanced & easy-to-learn custom enchantments\n├── 🐾 `petpvp`   :: Pet leveling & custom combat abilities\n└── 🛡️ `crossplay`:: Java 1.8–1.21+ & Bedrock crossplay support"
          }
        ],
        "accessory": {
          "type": 11,
          "media": {
            "url": "https://www.arcturusmc.org/assets/logo.png"
          }
        }
      },
      {
        "type": 12,
        "items": [
          {
            "media": {
              "url": "https://www.arcturusmc.org/images/trailer.jpg"
            },
            "description": "Arcturus Factions Reimagined Trailer"
          }
        ]
      },
      {
        "type": 10,
        "content": "*🎬 [Click to Watch Official Trailer](https://www.youtube.com/watch?v=kPjvbbAWTJ0) — Minecraft Factions Reimagined*"
      },
      {
        "type": 10,
        "content": "❄️ ─── ❖ ─── ❄️ ─── ❖ ─── ❄️ ─── ❖ ─── ❄️ ─── ❖ ─── ❄️"
      },
      {
        "type": 10,
        "content": "```yaml\n✦ Server IP:       play.arcturusmc.org\n✦ Bedrock Port:    19132 (Default)\n✦ Version Support: 1.8 — 1.21+ (Java & Bedrock)\n✦ Competition:     $100 Monthly FactionsTop Payouts\n✦ Gameplay:        Custom Cannons • Pet PvP • Non-P2W\n```"
      },
      {
        "type": 12,
        "items": [
          {
            "media": {
              "url": "https://www.arcturusmc.org/images/banner.gif"
            },
            "description": "play.arcturusmc.org"
          }
        ]
      },
      {
        "type": 14,
        "spacing": 1
      },
      {
        "type": 1,
        "components": [
          {
            "type": 2,
            "style": 5,
            "url": "https://www.arcturusmc.org/vote",
            "label": "Vote",
            "emoji": {
              "name": "🗳️"
            }
          },
          {
            "type": 2,
            "style": 5,
            "url": "https://store.arcturusmc.org",
            "label": "Store",
            "emoji": {
              "name": "🛒"
            }
          },
          {
            "type": 2,
            "style": 5,
            "url": "https://discord.gg/DTR6serkeM",
            "label": "Join Discord",
            "emoji": {
              "name": "💬"
            }
          }
        ]
      },
      {
        "type": 1,
        "components": [
          {
            "type": 2,
            "style": 5,
            "url": "https://www.youtube.com/watch?v=kPjvbbAWTJ0",
            "label": "Watch Trailer",
            "emoji": {
              "name": "🎬"
            }
          },
          {
            "type": 2,
            "style": 5,
            "url": "https://www.arcturusmc.org/",
            "label": "Official Website",
            "emoji": {
              "name": "🌐"
            }
          }
        ]
      },
      {
        "type": 10,
        "content": "❄️ ─── ❖ ─── ❄️ ─── ❖ ─── ❄️ ─── ❖ ─── ❄️ ─── ❖ ─── ❄️"
      }
    ]
  }
}
```

---

## 3. Video & Media Assets in Component Embeds

Per Discord API PR #8606:
- **YouTube Embedding**: Discord Component Embed `media.url` requires direct video or image file streams (PNG, WebP, GIF, MP4). Because `https://www.youtube.com/watch?v=...` is an HTML webpage rather than a raw video stream, embedding the YouTube watch URL inside a Media Gallery item fails Discord's crawler validation. Instead, the optimal and standard pattern is:
  1. The high-resolution video thumbnail (`/images/trailer.jpg`) is embedded in a Media Gallery.
  2. A dedicated action button `🎬 Watch Trailer` is placed in Action Row 2 linking directly to the YouTube video.
  3. A markdown caption `*🎬 [Click to Watch Official Trailer](...)*` provides an immediate clickable link above the divider.
- **Custom Banner (`banner.gif` & `banner.mp4`)**: Converted using FFmpeg into an optimized animated GIF (`/images/banner.gif`, 74KB) and placed directly above the action buttons, matching custom server tags.

---

## 4. Live Preview & Editing

You can test and modify everything in real time:
- **In-Chat Preview**: Interactive widget rendered right in your chat window.
- **Local Browser Studio**: Open `preview.html` in any browser to edit text, swap image links, pick new colors, and export JSON.
