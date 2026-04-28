# Claude Code config

These files need to be copied to the project root's `.claude/` folder for Claude Code to pick them up. The `.claude/` directory is gitignored in the main project; this folder is the source of truth.

## Setup (new project or fresh clone)

```bash
cp svelteload/apps/mcp/claude-config/settings.json .claude/settings.json
cp svelteload/apps/mcp/claude-config/launch.json .claude/launch.json
```

Then create `svelteload/apps/mcp/.env`:

```
PAYLOAD_API_KEY=<your-api-key-from-the-cms>
```

The MCP targets `http://localhost:3000` — start the cms with `pnpm --filter cms dev` before using the MCP.

## After updating the submodule

If `claude-config/` changed after a `git pull` inside the submodule, re-run the copy commands above and restart Claude Code.

## Files

- `settings.json` — MCP server config. Tells Claude Code to run `svelteload/apps/mcp` as the `payload-cms` MCP server.
- `launch.json` — Dev server config. Used by the Claude Preview tool to start the web app (port 5174) and the cms (port 3000).
