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
| `openart_generate_video` | Generate a video of a character speaking a script |
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

## Selector setup (one-time)

The tools in `src/tools.ts` ship with placeholder DOM selectors marked `TODO`. OpenArt's UI changes over time, so the selectors need to be captured against the live site:

```bash
npx playwright codegen https://openart.ai/suite/characters-and-worlds
```

Click through the UI for each tool's flow. Playwright generates real selectors. Paste them into the TODO spots in `src/tools.ts`, rebuild (`npm run build`), and the tools work.

If the selectors break later (OpenArt redesigns), repeat this step.

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
