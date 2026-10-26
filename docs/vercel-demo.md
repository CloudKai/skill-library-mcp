# Public Vercel demo

The root `index.mjs` is a separate Express entry point for Vercel. `npm run ui` continues to start the local owner app. Hosting the repository does not expose the local scanner or native installer.

## What is hosted

- The website, general guide and three synthetic skill packages from `demo-library/`.
- Two clearly illustrative example projects and a synthetic source-location inventory.
- Live public marketplace discovery through a separate authenticated hosted Marketplace MCP.
- A read-only library MCP containing only the fixed sample packages and example project scopes.

The browser can change sample skill selections, saved in that browser’s local storage. These changes do not modify shared server state, a real project, a coding assistant, or the public sample MCP’s fixed selections. Scanning, imports, native destination writes, shared profile creation and marketplace installation are rejected server-side. The UI marks local-only actions accordingly.

## Deployment configuration

Deploy the discovery repository first, then this repository as a separate Vercel project. Both use the existing Express framework, Node runtime, `npm ci` and `npm run build`. Their `vercel.json` files declare a 300-second maximum function duration. No database or paid integration is provisioned for the demo.

Configure these server-only environment variables on the website:

- `SKILL_MARKETPLACE_URL`: the discovery deployment’s HTTPS `/mcp` URL on its Vercel hostname.
- `MARKETPLACE_SERVICE_TOKEN`: the same private 64-character hex service credential configured on discovery.

The hosted client permits authenticated HTTPS Vercel endpoints explicitly. The local app continues to require its loopback HTTP discovery endpoint. Credentials never enter the browser response or source bundle. The discovery project uses its runtime Vercel OIDC identity for skills.sh; no local `.env.local` is uploaded.

## Excluded data

`.vercelignore` excludes the entire real `library/` tree, local inventory, imports, project settings, environment files, Git metadata, editor settings and local screenshots. Public synthetic packages live in a separate `demo-library/` tree. The deployment entry point always loads that tree explicitly, irrespective of `SKILL_LIBRARY_DIR`. Local filesystem paths shown in the demo are illustrative `/example/` or `/absolute/path/to/` placeholders.

Before deployment, inspect `vercel deploy --dry --json` and verify no private library or environment files are selected. Keep the generated service credential outside the deployment folder. Prefer a tested commit and keep deployment credentials out of source control.

## Verification

The library suite includes cloud demo data isolation, rejected scan/install/write routes, generic configuration, fixed sample MCP filtering, hosted-client opt-in, and browser-only selection persistence. The discovery suite covers service authentication, fail-closed missing credentials, foreign origins, real MCP metadata calls and the hosted package-download restriction.

Check the website `/health`, `/api/state`, `/api/capabilities`, all three pages and a marketplace ranking. Check discovery `/health` and verify `/mcp` rejects anonymous requests. Hosted discovery returns manifests and instructions; package-byte downloads remain in the local discovery service to avoid function payload limits. Provider cache/rate limits still apply; the demo adds a best-effort per-instance request bound, not a durable global abuse-control guarantee.

Current rendered browser verification may be unavailable when local browser use is disabled in Work settings. HTTP/MCP tests do not establish responsive or accessibility approval.

### Verified deployment — 2026-10-26

- Library: 67 tests passed. Discovery: 20 tests passed.
- Both production deployments built successfully. Anonymous HTTP checks reached all three website pages and their assets.
- The hosted library exposed exactly three synthetic skills and two example projects. Private catalog/environment/Git routes returned 404; scan/install/project writes returned 403.
- All four ranking tabs, keyword search, collection inspection and commit-pinned skill instructions succeeded through the website-to-discovery MCP connection.
- A real MCP SDK client verified the authenticated discovery tools and the public example-project library scope. Anonymous discovery MCP requests returned 401.
- Exact upload manifests excluded the owner library, local environment files, editor settings and private metadata.
- Responsive visual approval remains pending because browser use is disabled in Work settings.

The discovery dependency audit also reports pre-existing advisories in the OIDC package’s CLI-configuration dependency chain. These have not been resolved by a forced major downgrade; review upstream fixes during dependency maintenance. The website build reported no dependency advisories.
