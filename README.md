# svelteload

Shared platform code for [svelteload.com](https://svelteload.com) sites: a Payload CMS app, an MCP wrapper, and shared SvelteKit + Payload helpers, consumed as a single git submodule by each svelteload-based website.

## What's inside

```
svelteload/
├── apps/
│   ├── cms/                  # Next.js + Payload CMS (the admin app every project deploys)
│   └── mcp/                  # MCP wrapper that exposes a project's Payload config to LLMs
├── packages/
│   ├── payload/              # @svelteload/payload — shared Payload code: collections, fields, plugins, hooks
│   └── sveltekit/            # @svelteload/sveltekit — shared SvelteKit code: server helpers, search, components
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.base.json
```

## How it's consumed

Each svelteload project repo adds this repo as a git submodule at `svelteload/`, mounting these workspaces alongside the project's own `apps/web/` (the SvelteKit fullstack site) and `packages/payload-config/` (the per-project Payload config). The project's `pnpm-workspace.yaml` includes both sets of paths.

```
# In a project repo (e.g. ecsa-customs-website):
project/
├── svelteload/               # this repo, as a submodule
├── apps/
│   └── web/                  # per-project SvelteKit site
└── packages/
    └── payload-config/       # per-project Payload config + public assets
```

## Status

Early. The cms and mcp apps are being migrated in from the standalone `nodebrush/payload-admin` and `nodebrush/payload-mcp` repos; shared SvelteKit code is being factored out of existing projects. See `obsidian/it_dev/projects/svelteload/platform_setup.md` (private vault) for the migration plan.

## Licence

Svelteload is source-available under the [Functional Source License, Version 1.1, ALv2 Future License](LICENSE) (FSL-1.1-ALv2). Copyright 2026 Nodebrush AB.

You may read, fork, modify and self-host this code, including commercially, for any purpose that is not a Competing Use. Running your own sites on it is permitted, and so is paid work you do for someone else who is running it themselves. A Competing Use is offering the platform to others as a commercial product or service that substitutes for Svelteload, or for a service Nodebrush AB already provides using it. Building and hosting websites for third parties on this platform falls on that side of the line and needs a separate agreement with us.

Every version is additionally available under the Apache License 2.0 on the second anniversary of the commit that introduced it, which is the date we treat as making that version available. No version stays restricted permanently.

The `LICENSE` file is the binding text. The two paragraphs above summarise it and form no part of it. For a licence beyond these terms, contact [nodebrush.com](https://nodebrush.com).

### Dependencies

This licence covers the code in this repository only. Every third-party dependency is fetched from its own registry and stays under its own licence, including Payload CMS, SvelteKit and Svelte, all MIT. Nothing here redistributes their source, so their notices travel with their packages rather than with this repository.
