# Marketplace architecture · v0.4.0

## Request path

Browser → Skill Library owner API (3333) → discovery MCP client → Skill Marketplace MCP (3334) → skills.sh / GitHub APIs. Credentials remain in the discovery service. Existing library MCP retrieval is local and never calls discovery providers.

`MarketplaceClient.call` creates a real Streamable HTTP MCP connection per owner request. Discovery exposes only search, rankings, repository inspection and a resolved manifest. The library owns all writes. Both servers bind to loopback; browser-origin, Host and owner-write-token guards remain enabled.

## Project collections

The website requests `list_rankings(group_by:"repository")` for every tab and `search_marketplace(group_by:"repository")` for keyword search. GitHub stars already returns repositories and retains native pagination. Existing MCP callers still receive individual skills unless they opt into grouping.

Discovery reads at most the first 500 provider-ranked skills for each skills.sh ranking, groups public GitHub sources case-insensitively, counts distinct sampled skills, then paginates the collections. A project's position follows its highest-ranked member. Sample counts are not repository install totals or the complete collection size. Ranking responses include sample size, truncation flag, original ranking metric and retrieval timestamp. Most installed preserves all-time installs; Trending preserves provider order; Hot now preserves hourly installs compared with the same hour yesterday. Keyword search groups up to 50 provider matches in first-match order and then paginates collections, with `sample_limit:50` and the observed sample size disclosed. Search does not claim to cover every matching repository.

Selecting a collection resolves its pinned GitHub skill picker. The detail pane shows the repository description (or an explicit missing-description message), verified skill count, source link and one-line skill descriptions. Selecting a skill opens the existing inspection/install flow; Back to collection returns to its list. Long descriptions truncate visually and remain available as button text/title and in the full skill instructions.

## Install path

1. Inspect a skill at a full Git commit. A GitHub collection first resolves a picker of valid frontmatter packages.
2. The browser sends that exact source, slug, path and commit to `POST /api/marketplace/install` with its owner write token.
3. `get_marketplace_skill(include_files:true)` returns verified base64 file bytes and SHA-256 hashes. The library independently validates identity, sizes, paths, checksums and package format.
4. `saveMarketplacePackage` stages a temporary directory; `importPackage` validates the complete package, publishes immutable content-addressed bytes and atomically replaces the catalog under a catalog lock. Duplicate source/path installations return the existing entry; they do not silently update it.
5. The HTTP app reloads the catalog. If requested, the project transaction configures native bindings and/or enables the skill. Native failure returns HTTP 207 with `saved:true` and `native_error`; the library package remains available.

An ordinary new installation stays disabled. Existing installs preserve selections. Imported packages store full source SHA and available root attribution. Additional repository setup is reference text only. External sibling files, custom installers and runtimes are not resolved automatically.

## Native activation path

Each profile records `native_bindings`: skill ID, canonical project directory, and selected targets. Existing profiles default to an empty list. Targets map to `.agents/skills`, `.claude/skills`, and `.cursor/skills` within the selected project. A binding plus enabled selection creates a copy. Disabled selection removes an unchanged managed copy. Clearing the binding retains the selection and removes its native copies.

`ProjectStore.mutate` acquires `projects.lock`, recovers a prior operation, verifies the expected project revision and stages changes for every destination. `.skill-library-owner.json` records library/project/skill identity and file hashes. Existing names, edited files, extra files, symlinks and shared-path ownership conflicts stop the operation; nothing is overwritten.

Staging directories are siblings of `skills`, outside native skill discovery. A journal records before/after project-file hashes and exact managed paths before any native rename. Native changes apply, then `projects.json` is atomically replaced as the commit point. On failure before commit, changes reverse. On startup, a matching before hash rolls back, a matching after hash finalizes cleanup; unrelated project changes or occupied recovery destinations fail closed and preserve evidence. Locks from dead processes can be reclaimed. Simultaneous writes from live processes return `PROJECTS_BUSY` and can be retried. Pre-journal crashes can leave harmless hidden staging directories outside skill discovery.

Project changes are live on subsequent MCP calls. Package imports refresh HTTP immediately; stdio package snapshots require reconnecting. Agent-native discovery may need a reload. Instructions already in a conversation cannot be erased by a switch.

## Owner API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/marketplace/rankings?view=…&page=0` | Provider ranking, metric and cache timestamp. |
| `GET /api/marketplace/search?q=…&page=0` | Grouped keyword discovery with collection pagination. |
| `GET /api/marketplace/repository?source=owner/repo` | Verified collection picker with pinned commit. |
| `GET /api/marketplace/skill?source=…&skill=…&path=…&commit=…` | Resolved instructions, requirements, setup, provenance and manifest. |
| `POST /api/marketplace/install` | Owner-only import; optional `project_id`, `targets`, `root`, `enabled`. Full commit required. |
| `PATCH /api/projects/:id/native` | Owner-only destination replacement with expected project revision; empty targets removes managed native bindings. |

The four existing library MCP tools remain read-only. Installation and activation are not exposed to model callers.
