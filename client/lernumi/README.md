# EasyDraw as a Lernumi tool

This folder builds the editor as a package that Lernumi can host inside an
assessment attempt. Students launch it from the attempt page and land straight
on the dashboard; there is no easydraw account, login, or NestJS server involved.

## How it differs from easydraw.net

| | easydraw.net (`src/app`) | Lernumi tool (`lernumi/`) |
| --- | --- | --- |
| Bundler | Next.js static export | Vite, `base: './'`, one `index.html` |
| Identity | Cookie + `/auth/me` | Launch token in the URL fragment → `GET /api/tool/v1/context` |
| Diagrams | Rows in the easydraw DB | `<title>.easydraw` files in the attempt workspace (`/api/tool/v1/documents`) |
| Navigation | App Router routes | Screen state in `src/app-store.ts`; `next/link` and `next/navigation` are aliased to `src/shims/` |
| After submission | n/a | `session.readOnly`: canvas locked, no create/rename/delete |

The editor itself (`src/lib/**`) is shared. Its only host-specific seam is
`src/lib/backend.ts`: autosave calls `getDiagramBackend().saveDiagram()`, which
the Lernumi host points at the workspace API on startup.

## Build and upload

```sh
npm run build:lernumi      # → dist-lernumi/
npm run package:lernumi    # → artifacts/easydraw-<version>.zip
```

Every upload is immutable, so bump `version` in `tool.json` before packaging a
change. Then in Lernumi: **Admin → Tools → EasyDraw → New version**, upload the
zip, keep "activate" on. Attach the tool to an assessment under
**Offerings → assessment → Rules and tools**.

If `npm run` cannot spawn a shell on your machine, call the steps directly:

```sh
node node_modules/vite/bin/vite.js build --config vite.lernumi.config.mts
node scripts/package-lernumi.mjs
```

## Runtime contract

See `docs/tool-platform/README.md` in the Lernumi repository. Points that shaped
this build:

- Assets are served from `/tools/easydraw/<versionId>/…`, so every URL in the
  bundle must be relative (fonts included — check `dist-lernumi/assets/*.css`).
- CSP is `connect-src 'self'`: the tool can only talk to `/api/tool/v1/*`.
- Tailwind is told to scan `../../src` from `src/styles.css`; without that,
  utilities used only by the shared editor are dropped from the bundle.
- The token lives in memory. A hard reload loses it; the student reopens the
  tool from Lernumi. Refresh runs every ~4 minutes via `POST /token`.
