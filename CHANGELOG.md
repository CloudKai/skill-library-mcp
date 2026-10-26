# Changelog

## 0.5.0 — Unreleased

- Add a separate Vercel public demo entry point using synthetic skills/projects/locations, browser-only sample selections and live authenticated marketplace discovery.
- Exclude owner library data from deployment and reject cloud scanning, installation and shared profile writes.

- Persist scan source inventory across reloads and restarts, grouped into global installations, custom locations and discovered project directories.
- Show platform/location identifiers on saved skills and provide read-only source views with import status, paths and last-seen times, separate from project activation.
- Preserve observations outside narrower scans and report partial coverage without silently claiming current installation state.

- Make the MCP guide general with placeholder-only examples, generic skill descriptions and no saved-project loading. Keep local configuration in Connect project.
- Highlight the guide section being read and keep its sidebar link visible without moving the article.

- Add local skill inventory and selected import in the website, plus a reusable scan CLI.
- Cover supported global locations, configured roots, registered/native project directories, inherited/nested projects and user-added folders.
- Inspect enabled/registered plugin manifests, distinguish unverified caches, deduplicate physical/content copies and report incomplete coverage or unsupported packages.
- Revalidate packages against the preview, preserve available attribution, serialize scanner operations and report per-package import failures. New imports remain disabled.
- Place Projects and guide sections beneath their sidebar page links; keep Marketplace ranking filters in the main page without duplicating them in the sidebar.
- Store new imports and machine-specific profiles outside the versioned starter data; use placeholder paths in shared setup examples.
- Keep tests independent of the owner’s growing library and preserve existing project selections.

## 0.4.0 — 2026-10-26

- Add a shared sidebar show/hide icon, persistent wide/narrow preferences, compact navigation and keyboard focus handling across the library, marketplace and guide.

- Show all marketplace rankings and search as repository collections instead of separate skill entries, using the discovery MCP’s deduplicated, bounded ranking window.
- Add project descriptions, compact per-skill summaries and a Back to collection action.
- Keep individual results as the default for existing discovery MCP callers; preserve GitHub repository-star ranking and pagination.

## 0.3.0 — 2026-10-26

- Add Marketplace search, verified source details, collection pickers, and four accurately labeled provider rankings through a separate local discovery MCP.
- Add commit-pinned, checksum-validated public GitHub installation using the shared local importer; ordinary new installs remain disabled.
- Add project-local Codex, Claude Code and Cursor destinations, shared MCP/native activation, owned-file conflict checks, staged operations, rollback and startup recovery.
- Preserve existing project selections and MCP-only behavior until native destinations are explicitly configured.
- Fix sidebar project-label overflow at the 682-pixel panel width.
- Extend the setup guide with discovery authentication, native installations, activation and troubleshooting.
- Verify provider fixtures, real MCP clients, installation-to-activation tests, and desktop/narrow/mobile browser layouts.

## 0.2.0 — 2026-10-26

- Group the saved Matt Pocock skills under their author collection.
- Display Impeccable as a standalone skill, with one project switch for all its commands.
- Add the installed Impeccable 4.7.0 text snapshot, references, script sources, license and attribution. Its platform engine is not bundled.
- Keep collection activation independent of standalone selections and preserve existing project selections.
- Add a responsive MCP setup and usage guide with project-specific configuration, copy feedback, tool reference, workflow examples, and troubleshooting.
- Add `--standalone` to local imports and expose presentation metadata in retrieval summaries.
- Allow supporting files up to 2 MiB while retaining total package limits, to accommodate Impeccable’s font catalog.
- Verify 18 automated tests, TypeScript compilation and the four-skill catalog.

## 0.1.0 — 2026-10-26

- Initial local MCP library, four retrieval tools and three Matt Pocock starter packages.
- Browser UI, independently saved project selections, collection toggles, and live project-scoped reads.
