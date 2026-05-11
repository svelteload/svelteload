# cms

Shared Payload CMS v3 admin panel. Lives inside the `svelteload` platform monorepo at `svelteload/apps/cms/` and is consumed by every project that mounts the `svelteload` submodule.

Not a standalone app. Requires a parent project with `packages/payload-config/` providing project-specific collections, globals, blocks, components, and branding assets.

## What's shared here

- `src/components/` — reusable admin UI components (`ArrayRowLabel`, `TextareaWithCounter`, `ContentReviewNavLink`, `RolePublishButton`, etc.)
- `src/access/`, `src/fields/`, `src/email/`, `src/features/`, `src/invites/`, `src/plugins/`, `src/previewAuth/` — shared admin behaviour
- `next.config.mjs` — Next.js + Payload wiring
- `tsconfig.json` — path aliases for `@cms/*` (this app's `src/*`) and `@payload-config/*` (per-project)
- `scripts/copy-assets.js` — prebuild script that copies branding from the project's `packages/payload-config/public/` into this app's `public/`
- `public/robots.txt` — generic robots file

## What lives in the project, not here

- `packages/payload-config/src/components/` — project-specific admin components (`Logo`, `Icon`, `ColorPicker`, etc.)
- `packages/payload-config/public/` — branding assets (`logo.png`, `favicon.png`, `icon.png`, `apple-touch-icon.png`, block preview images)
- `packages/payload-config/src/payload.config.ts` — full Payload config (DB, storage, localization, component refs)
- `svelteload/apps/cms/.env` — credentials (gitignored in this submodule, never committed to the platform repo)

## Component aliases

Components referenced in `packages/payload-config` use two aliases:

| Alias | Resolves to | Purpose |
|---|---|---|
| `@cms/components/X` | `svelteload/apps/cms/src/components/X` | Shared components (this app) |
| `@payload-config/components/X` | `packages/payload-config/src/components/X` | Project-specific components |

## Branding assets

`scripts/copy-assets.js` runs automatically before every dev/build (`predev` + `prebuild` in `package.json`) and copies the project's `packages/payload-config/public/` into this app's `public/`. The copied `public/` directory is gitignored in this submodule, so per-project assets never end up in the platform repo.

## Local env (`.env`)

Per-project. Lives at `svelteload/apps/cms/.env` (gitignored). Required keys:

```
POSTGRES_URL=
PAYLOAD_SECRET=
S3_BUCKET=
S3_ENDPOINT=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
PUBLIC_SITE_URL=http://localhost:5173
PUBLIC_PAYLOAD_ADMIN_URL=http://localhost:3000
PUBLIC_PREVIEW_URL=http://localhost:5174
```
