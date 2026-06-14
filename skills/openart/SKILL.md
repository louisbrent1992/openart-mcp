---
name: openart
description: Use when the user wants to manage OpenArt.ai characters/avatars or generate videos (including product ads) with them. Triggers on "openart", "create avatar", "create character", "openart character", "openart video", "generate openart video", "product ad video", "make an ad", "list openart characters". Requires the openart-mcp server installed and authenticated.
---

# OpenArt Skill

Pair to the `openart-mcp` server (https://github.com/jbertus/openart-mcp). OpenArt.ai has no public API, so the MCP drives the web UI via Playwright. This skill tells Claude when and how to call the MCP tools.

## Tools available (from openart-mcp)

- `openart_list_characters` — return every character in the user's account
- `openart_get_character` — fetch one character by **name** (this OpenArt UI has no numeric IDs)
- `openart_create_character` — create a new character from a local front-facing image
- `openart_generate_video` — generate a video from a **text prompt** (OpenArt's Text-to-Video / Seedance). Good for **product ads**: describe the scene in `script` and optionally attach ONE reference — a **BytePlus library character** (`byteplus_character`, recommended for people), a product photo (`image_path`), or a user character (`character_id`).
- `openart_get_video_status` — poll a video render by the id returned from `generate_video`

## Intent → tool routing

| User intent | Tool sequence |
|---|---|
| "What characters do I have on OpenArt?" / "list avatars" | `openart_list_characters` |
| "Show me [character name]" | `openart_list_characters` → `openart_get_character` |
| "Create a new OpenArt character" / "make an avatar from this image" | `openart_create_character` |
| "Make a product ad video" / "video of this product" | `openart_generate_video` { script, image_path } |
| "Make a video with a person in it" | `openart_generate_video` { script, byteplus_character } |
| "Is the video done?" / "check video status" | `openart_get_video_status` |

## Argument tips

- **Characters are identified by NAME**, not a numeric id. Pass the character's display name everywhere a character id is expected.
- **`image_path`** must be an **absolute local path** (Playwright reads from disk). For `generate_video`, this is the reference image — e.g. a **product photo** to feature in the ad.
- **`script`** (generate_video) is the **video prompt**: describe the scene, action, mood, and what the product/character does. It is NOT spoken dialogue — this UI generates a clip from the description; it does not lip-sync speech.
- **`aspect_ratio`** options: `9:16` (vertical/Reels/Shorts/TikTok), `16:9` (landscape/YouTube), `1:1` (square), plus `4:3`, `3:4`, `21:9`. Best-effort; defaults to the tool's current setting if it can't be set.
- **`byteplus_character`** (generate_video) is the **recommended** way to put a person in the shot. One of: `Model`, `Singer`, `DJ/Music Producer`, `Clerk/Administrative Staff`, `Retiree`. OpenArt's Seedance model warns that user-uploaded faces cause generation failures, so prefer these.
- **Reference precedence** (generate_video): `byteplus_character` > `image_path` > `character_id`. Attach only one. `character_id` (a user's own character) is **discouraged** for this model and may fail.
- **`background_story`** when creating a character: persona, mannerisms, wardrobe. OpenArt uses it for consistency across generations.
- **Voice when creating a character** is an audio upload / library picker in the UI — the `voice_id` argument is currently ignored.

## Latency expectations

- `list_characters` / `get_character`: 5–15s (browser launch + page load)
- `create_character`: 30–90s (upload + processing)
- `generate_video`: returns a job id immediately; render takes ~1–10 minutes; poll `get_video_status`. Costs ~400 credits/run.

## Common patterns

### Product ad video
```
1. openart_generate_video { script: "<ad concept: scene, action, mood>", image_path: "/abs/path/product.png", aspect_ratio: "9:16" }
2. openart_get_video_status { video_id } — poll every 30s until status == "complete"
3. Return the resulting video URL to the user
```

### Video featuring an existing character
```
1. openart_list_characters → confirm the character's name
2. openart_generate_video { script, character_id: "<name>", aspect_ratio }
3. openart_get_video_status { video_id } — poll until complete
```

### New character from a fresh image
```
1. openart_create_character { name, image_path, background_story? }
2. Reuse the character by NAME in later calls
```

## Setup verification

If a tool call fails with "No saved auth at...":
```
cd <path-to-openart-mcp>
npm install
npx playwright install chromium
npm run build
npm run login
```

If a tool returns empty / wrong data, OpenArt has likely redesigned and the selectors in `src/tools.ts` are stale. Re-capture against the live UI:
```
npx playwright codegen https://openart.ai/suite/characters-and-worlds
npx playwright codegen https://openart.ai/suite/create-video
```
and update the matching selectors in `src/tools.ts`, then `npm run build`.

## Limits and risks

- **No public API** — every action drives the web UI as a logged-in user
- **UI changes break selectors** — periodic re-tuning required
- **Anti-bot detection** — heavy automation may rate-limit or ban the account
- **Session expiration** — re-run `npm run login` when prompted
- **One browser instance at a time** — concurrent tool calls share the session

## Companion repo

MCP server source: https://github.com/jbertus/openart-mcp
