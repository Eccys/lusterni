# Arcturus Discord Link Preview (Components V2)

This document explains the Discord Link Preview configuration for **[arcturusmc.org](https://www.arcturusmc.org/)**, implemented using Discord's new **Component Embeds** ([Discord API Docs PR #8606](https://github.com/discord/discord-api-docs/pull/8606)).

---

## 1. Overview

When you share `https://arcturusmc.org/` or `https://www.arcturusmc.org/` on Discord, Discord's crawler detects the inline `<script id="discord:component-embed" type="application/json">` tag in `index.html`. It renders the preview as a **Components V2 Container** with:
1. **Accent Color**: Electric Cyan (`#18cfdc` / decimal `1626076`) matching the Arcturus website primary brand color.
2. **Text Display**: Markdown-formatted title (`ArcturusMC Factions & KitPvP`) and blurb.
3. **Media Gallery**: High-resolution spawn hero image (`/images/og-image.webp`).
4. **Separator**: Sleek spacing divider.
5. **Action Row with 3 Link Buttons**:
   - 🗳️ **Vote** &rarr; `https://www.arcturusmc.org/vote`
   - 🛒 **Store** &rarr; `https://store.arcturusmc.org`
   - 💬 **Discord** &rarr; `https://discord.gg/DTR6serkeM`

---

## 2. The JSON Payload (`discord-embed.json`)

The payload embedded inside `<script id="discord:component-embed" type="application/json">` in `index.html` is:

```json
{
  "component": {
    "type": 17,
    "accent_color": 1626076,
    "components": [
      {
        "type": 10,
        "content": "# **[ArcturusMC Factions & KitPvP](https://www.arcturusmc.org/)**\nArcturusMC is a cracked Minecraft Java+Bedrock server supporting 1.8–26.2 clients. We have monthly FactionsTop payouts, easy-to-learn custom enchants, and pet pvp."
      },
      {
        "type": 12,
        "items": [
          {
            "media": {
              "url": "https://www.arcturusmc.org/images/og-image.webp"
            },
            "description": "ArcturusMC Spawn"
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
            "label": "Discord",
            "emoji": {
              "name": "💬"
            }
          }
        ]
      }
    ]
  }
}
```

---

## 3. How to Customize

### A. Editing the Title & Blurb
In the `type: 10` (Text Display) component:
- `content` accepts full Discord Markdown:
  - Headers: `# Heading 1`, `## Heading 2`, `### Heading 3`
  - Bold: `**text**`
  - Links: `[Text](https://...)`
  - Italic: `*text*`
  - Bullet points: `- item`

### B. Changing the Buttons & Icons
In the `type: 1` (Action Row) component:
- Each button has:
  - `"type": 2` (Button)
  - `"style": 5` (Link button - required for component embeds)
  - `"url"`: Absolute URL (`https://...`)
  - `"label"`: Display text (e.g. `Vote`, `Store`, `Discord`)
  - `"emoji"`: Standard Unicode emoji object (e.g. `{"name": "🗳️"}`)
- *Rules per PR #8606*: Buttons may **only** include `type`, `url`, `style`, `label`, `emoji`, and `disabled`. Keys like `id`, `custom_id`, or `sku_id` are not permitted in component embeds and will invalidate the payload.

### C. Changing the Accent Color
- The container uses an integer color code:
  - **Site Electric Cyan (`#18cfdc`)**: `1626076`
  - **Faction Amber (`#f17800`)**: `15824896`
  - **Discord Blurple (`#5865f2`)**: `5793266`
- To convert any Hex code (e.g. `#18CFDC`):
  - In Python: `int("18cfdc", 16)` &rarr; `1626076`
  - In JavaScript: `parseInt("18cfdc", 16)` &rarr; `1626076`

### D. Changing the Hero Image
In the `type: 12` (Media Gallery) component:
- `"url"`: Must be an absolute public HTTPS URL (e.g. `https://www.arcturusmc.org/images/og-image.webp`).
- Formats supported: PNG, GIF, JPEG, WebP, AVIF.

---

## 4. Deploying Updates

Whenever you make changes to `index.html` or `discord-embed.json`:

```bash
git add index.html discord-embed.json DISCORD_LINK_PREVIEW.md
git commit -m "Update Discord link preview"
git push origin newgen
```

---

## 5. Testing & Cache Busting

Discord caches link previews for ~30 minutes:
1. **Immediate Preview Refresh**: Paste the link with a query parameter in any channel, for example:
   - `https://arcturusmc.org/?v=1`
   - `https://www.arcturusmc.org/?v=2`
2. **Discord Embed Debugger**: Test the URL directly in the official tool at:
   - https://discord.com/developers/embeds
