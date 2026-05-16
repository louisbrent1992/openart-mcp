---
name: openart
description: Use when the user wants to manage OpenArt.ai characters/avatars or generate videos with them. Triggers on "openart", "create avatar", "create character", "openart character", "openart video", "generate openart video", "list openart characters", "speak script with avatar". Requires the openart-mcp server installed and authenticated.
---

# OpenArt Skill

Pair to the `openart-mcp` server (https://github.com/jbertus/openart-mcp). OpenArt.ai has no public API, so the MCP drives the web UI via Playwright. This skill tells Claude when and how to call the MCP tools.

## Tools available (from openart-mcp)

- `openart_list_characters` — return every character in the user's account
- `openart_get_character` — fetch one character by ID
- `openart_create_character` — create a new character from a local image
- `openart_generate_video` — generate a video of a character speaking a script
- `openart_get_video_status` — poll a video render

## Intent → tool routing

| User intent | Tool sequence |
|---|---|
| "What characters do I have on OpenArt?" / "list avatars" | `openart_list_characters` |
| "Show me [character name]" | `openart_list_characters` → `openart_get_character` |
| "Create a new OpenArt character" / "make an avatar from this image" | `openart_create_character` |
| "Make a video of [character] saying [script]" | `openart_list_characters` (to find ID) → `openart_generate_video` |
| "Is the video done?" / "check video status" | `openart_get_video_status` |

## Argument tips

- **`image_path`** must be an **absolute local path** (Playwright reads from disk).
- **`script`** is dialogue the avatar speaks. Cap ~200 words per 60s of intended video for natural pacing.
- **`aspect_ratio`** options: `9:16` (vertical/Reels/Shorts), `16:9` (landscape/YouTube), `1:1` (square).
- **`background_story`** when creating a character: persona, voice, mannerisms, wardrobe. OpenArt uses it for consistency across generations.
- **`voice_id`** is optional. If omitted, OpenArt assigns a default voice. List voices via the OpenArt UI to capture IDs.

## Latency expectations

- `list_characters` / `get_character`: 5–15s (browser launch + page load)
- `create_character`: 30–90s (upload + processing)
- `generate_video`: returns a job ID immediately; render takes 2–10 minutes; poll `get_video_status`

## Common patterns

### One-off video with an existing character
```
1. openart_list_characters
2. Pick the character ID matching the user's request
3. openart_generate_video { character_id, script, aspect_ratio }
4. openart_get_video_status { video_id } — poll every 30s until status == "complete"
5. Return the resulting video URL to the user
```

### New character from a fresh image
```
1. openart_create_character { name, image_path, background_story?, voice_id? }
2. Save the returned ID for reuse
```

### Generate consistent series with one character
Use the same `character_id` for every clip. OpenArt's character system preserves face/voice across generations when the ID is reused.

## Setup verification

If a tool call fails with "No saved auth at...":
```
cd <path-to-openart-mcp>
npm install
npx playwright install chromium
npm run build
npm run login
```

If a tool returns empty / wrong data, the OpenArt UI selectors in `src/tools.ts` are stale. Run:
```
npx playwright codegen https://openart.ai
```
and update the selectors marked `TODO` in the MCP source.

## Limits and risks

- **No public API** — every action drives the web UI as a logged-in user
- **UI changes break selectors** — periodic re-tuning required
- **Anti-bot detection** — heavy automation may rate-limit or ban the account
- **Session expiration** — re-run `npm run login` when prompted
- **One browser instance at a time** — concurrent tool calls share the session

## Companion repo

MCP server source: https://github.com/jbertus/openart-mcp
