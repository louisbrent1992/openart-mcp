# openart-mcp

MCP server + Claude skill for OpenArt.ai. OpenArt has no public API, so this drives their web UI as a logged-in user via Playwright.

## What's in this repo

- **MCP server** (`src/`) — exposes 5 tools that automate OpenArt character + video workflows
- **Claude skill** (`skills/openart/SKILL.md`) — tells Claude when and how to call the MCP tools

## Tools

| Tool | Purpose |
|---|---|
| `openart_list_characters` | List every character in your OpenArt account |
| `openart_get_character` | Get details for one character by ID |
| `openart_create_character` | Create a new character from a local image |
| `openart_generate_video` | Generate a video from a text prompt (Text-to-Video) — e.g. product ads, optionally featuring a product photo or character |
| `openart_get_video_status` | Check render status + URL of a generated video |

## Install

### 1. Install the MCP server

```bash
git clone https://github.com/jbertus/openart-mcp.git
cd openart-mcp
npm install
npx playwright install chromium
npm run build
npm run login   # opens browser, log in to OpenArt, press Enter when done
```

The login step saves a Playwright `storageState` JSON to `~/.openart-mcp/auth.json` (or `%USERPROFILE%\.openart-mcp\auth.json` on Windows). The server reuses that session for every subsequent tool call.

### 2. Register the MCP with your client

**Claude Code / Claude Desktop** — add to your MCP config (`~/.claude/mcp.json` or equivalent):

```json
{
  "mcpServers": {
    "openart": {
      "command": "node",
      "args": ["<absolute-path-to-cloned-repo>/dist/index.js"]
    }
  }
}
```

**Other MCP clients** — point to `node <repo>/dist/index.js` with stdio transport.

### 3. Install the companion skill (optional but recommended)

```bash
npx skills add https://github.com/jbertus/openart-mcp --skill openart
```

The skill teaches Claude when to call which tool and how to format arguments. Without it, Claude can still use the MCP but you'll have to spell out intent more explicitly.

## Configuration

Environment variables (all optional):

| Var | Default | Purpose |
|---|---|---|
| `OPENART_STORAGE_STATE` | `~/.openart-mcp/auth.json` | Path to Playwright session JSON |
| `OPENART_HEADLESS` | `true` | Set to `false` to see the browser during automation |

## Selectors

The tools in `src/tools.ts` carry real DOM selectors captured against the live OpenArt "Infinite" suite UI (`/suite/characters-and-worlds`, `/suite/create-video`). Notes on this UI:

- Characters have **no numeric IDs or per-asset URLs** — they're identified by **name**.
- Generated videos are tracked by the feed card's `data-item-id` (returned from `openart_generate_video`).
- `openart_generate_video` drives the **Text-to-Video** tool (good for product ads), not lip-sync.

If OpenArt redesigns and the selectors break, re-capture them:

```bash
npx playwright codegen https://openart.ai/suite/characters-and-worlds
npx playwright codegen https://openart.ai/suite/create-video
```

Update the matching selectors in `src/tools.ts`, then rebuild (`npm run build`).

## Risks

- **Fragile to UI changes.** Every OpenArt redesign may break selectors. Re-run codegen and re-patch.
- **Slower than a real API.** Each tool call launches a browser session and waits on page loads.
- **Session can expire.** Re-run `npm run login` when prompted.
- **OpenArt may block automation.** Anti-bot detection could rate-limit or ban your account. Use sparingly. No recourse if banned.

## Testing

```bash
npm run inspect    # launches MCP Inspector against the server
```

## Contributing

PRs welcome. If OpenArt's UI changes and the selectors break, open an issue with the new selectors and a brief description of which tool flow needs updating.

## License

MIT — see [LICENSE](LICENSE).
