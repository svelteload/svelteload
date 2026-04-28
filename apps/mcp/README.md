# mcp

Payload CMS MCP server for Claude Code. Lives inside the `svelteload` platform monorepo at `svelteload/apps/mcp/` and is consumed by every project that mounts the `svelteload` submodule.

Gives Claude Code read/write access to a running Payload CMS instance via its REST API. Not a standalone tool, requires the local cms dev server on port 3000 and an API key in `.env`.

The MCP **only targets `http://localhost:3000`**. Contact-sheet generation (`browse_media`) returns local file paths that Claude reads off disk, so the cms must run on the same machine as Claude Code. CRUD tools follow the same rule for consistency. Start the cms with `pnpm --filter cms dev` before using any tool other than `get_schema`.

## Tools provided

| Tool | Description |
|---|---|
| `get_schema` | Returns all collections, globals, blocks, and fields from the project's Payload config |
| `find` | Query a collection with filters, pagination, locale, depth |
| `get_by_id` | Fetch a single document by ID |
| `create` | Create a new document (always saved as draft) |
| `update` | Update an existing document (always saved as draft) |
| `get_global` | Fetch a global document |
| `update_global` | Update a global document (always saved as draft) |
| `update_section` | Update a single block/section within a page |
| `browse_media` | Generate visual contact sheets of all uploaded media |

## Setup in a new project

The mcp comes for free when you mount the svelteload submodule. From the project root:

```bash
cp svelteload/apps/mcp/claude-config/settings.json .claude/settings.json
cp svelteload/apps/mcp/claude-config/launch.json .claude/launch.json
```

Create `svelteload/apps/mcp/.env` (gitignored, never committed):

```
PAYLOAD_API_KEY=<api-key-from-cms-users>
```

## How credentials work

The mcp connects to the local cms at `http://localhost:3000` using `PAYLOAD_API_KEY` from `svelteload/apps/mcp/.env`. The API key is created in the Payload admin under Users; the Users collection has `useAPIKey: true` enabled.

## `get_schema` and the local config

The `get_schema` tool imports `payloadConfigBase` from `packages/payload-config` directly (TypeScript, not HTTP). This is why the mcp must be inside the project's workspace, it reads the project's actual config files to build the schema description.
