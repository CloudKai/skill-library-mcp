# Local skill scanner

The scanner inventories on-disk `SKILL.md` packages. It reads local files without AI, downloads, repository scripts or cloud account access. It does not claim to find every skill on a computer or determine which instructions an agent currently loads.

## Use

In Library choose **Scan installed skills**, select Global & projects, Global only or Projects only, and choose platforms. Registered project paths and configured native destination roots are included in project scans. Add an existing workspace directory to discover nested projects; add a custom skill directory for locations outside the supported conventions. Absolute paths are required; use your own values in place of `/absolute/path/to/projects`.

Review each source and the **Scanned locations & coverage** report. Ready new packages are selected; already saved and unsupported packages are not selectable. Cached-only plugin packages require explicit opt-in and explicit selection. Importing copies complete validated packages into the local library without modifying originals, enabling skills, or installing their host tools/dependencies.

The CLI uses the same scanner:

```sh
npm run scan-skills
npm run scan-skills -- --scope projects --project-directory /absolute/path/to/projects
npm run scan-skills -- --skill-directory /absolute/path/to/custom-skills --import-all
```

The CLI does not import packages unless `--import-all` is supplied; scans still update the private source inventory. This flag imports ready packages only. Restart a running website after a CLI import. Website imports refresh the HTTP catalog immediately. Reconnect existing stdio MCP clients after new packages are added.

## Locations and installation evidence

| Platform | Global root | Project root | Additional evidence |
| --- | --- | --- | --- |
| Shared | `~/.agents/skills` | `.agents/skills` | Valid packages on disk |
| Codex | `$CODEX_HOME/skills` or `~/.codex/skills` | `.codex/skills` | Configured skill paths; enabled plugin config and registered local plugin metadata |
| Claude Code | `$CLAUDE_CONFIG_DIR/skills` or `~/.claude/skills` | `.claude/skills` | Registered plugin installation records and manifests |
| Cursor | `~/.cursor/skills` | `.cursor/skills` | Local plugin manifests; plugin cache is unverified and excluded by default |
| OpenCode | `$XDG_CONFIG_HOME/opencode/skills` or `~/.config/opencode/skills` | `.opencode/skills` | Valid packages on disk |

Environment overrides are taken from the running service, not inferred from another app. Enabled/registered plugin manifests constrain discovery to their declared skill directories. Multiple cached plugin versions produce a warning because the runtime-loaded version cannot be proven. A project profile pointing inside a Git worktree also includes inherited skill locations up to that worktree root. Nested workspace discovery skips hidden/dependency/build directories; known platform folders are checked explicitly. Arbitrary project symlinks are not followed.

Official platform references: [Claude Code skills](https://code.claude.com/docs/en/skills), [Cursor skills](https://cursor.com/docs/context/skills), and [OpenCode skills](https://opencode.ai/docs/skills/). Support is limited to the locations and formats above. Built-in system skills, rules, commands, private remote runtimes and cloud-only installations are outside this scanner.

## Validation, deduplication and limits

Packages need portable YAML frontmatter with a valid name, description and matching directory name. The importer preserves supporting files and available ancestor LICENSE/NOTICE/COPYING attribution, keeping conflicting attribution under separate filenames. Internal symlinks and paths escaping a declared plugin boundary are rejected. Root aliases can point to the same physical package; their observed origins are merged.

Physical aliases and identical complete package content are deduplicated. Existing source identity or matching saved instructions marks a package already saved; this does not establish supporting-file equality or apply updates. Two different sources with the same skill name can remain distinct. Dependencies, credentials and host-specific commands are not validated.

Each package is limited to 128 files, 8 MiB total, 2 MiB per file, 256 KiB for SKILL.md, 256 directories and 16 directory levels. A scan is bounded by 10,000 project directories, 10,000 skill directories, discovery depth limits, 500 result packages and 128 MiB of eligible package content. Reports distinguish missing locations, unreadable locations, unsupported packages and incomplete coverage. Reduce scope if a limit is reached.

## Browse discovered source locations

After scanning, Library provides a persistent **Found on this computer** disclosure. **All discovered** combines observed packages; **Global installations** shows non-project platform roots/plugins; discovered projects show only packages observed in that project directory. Custom roots appear separately. A project appears when supported skill packages are found there; the scanner is not a general catalog of every folder or repository on the computer.

The full saved library remains available through **Library → All skills**. The inventory also includes unimported, unsupported and cached/unverified packages. The same saved skill may be visible in several location groups. Directory-based project IDs distinguish equal folder names; short path hints help identify them. Platform/source badges appear on saved skill rows, and full source paths with last-seen times are available in disclosures. Source locations do not create project profiles or change MCP/native activation. **Project access** remains the explicit activation area.

Inventory observations are stored in ignored `library/.local/inventory.json` with an atomic replacement under a process lock and a 16 MiB / 10,000-origin bound. Narrow scans preserve other roots. Complete scans remove old observations only within successfully scanned or missing platform roots. Partial scans retain historical observations, which are labeled by last-seen time rather than asserted current installation state. Imports update inventory links to the saved copy. The inventory is local owner UI data and is not added to agent-facing MCP tool results. Its location data is not sent to the marketplace provider.

## API and import lifecycle

Owner-side POST endpoints require the local app's existing host/origin and CSRF protections:

- `GET /api/local-skills/inventory`: returns the saved source groups, unique skill rows, origins and last-scan coverage for the owner UI; it does not scan or import.
- `/api/local-skills/scan`: accepts scope, platforms, optional project IDs, project directories, skill directories and include_cached. Returns a preview ID, source origins, statuses, location coverage and warnings.
- `/api/local-skills/import`: accepts the scan ID and selected item IDs. Returns per-package imported/already-installed/failed outcomes. Partial failures use HTTP 207; successful imports use 201.

Scan previews expire after 15 minutes; the service retains at most eight. Scan and import operations are serialized within the scanner; the shared catalog lock serializes imports across processes. Before import, each selected source is reread and compared with its preview digest, including attribution. Changed packages fail with SOURCE_CHANGED and need a fresh scan. Packages are staged and validated before an atomic catalog update. Each package is independently committed; one failure does not undo other successful packages.

No scanner write tools are added to MCP. The existing four retrieval tools remain read-only. New copies stay disabled for all projects and have no native bindings until configured separately.

## Privacy and troubleshooting

The shareable catalog stays in `library/catalog.json`. User imports go to Git-ignored `library/.local/`; project selections and directory paths stay in Git-ignored `library/projects.json`. The scanner's source metadata and on-device preview can contain real paths. Treat exported reports, generated connection configurations and screenshots as private. Repository examples use placeholders. Ignoring current data does not rewrite older Git history.

If a skill is missing, check the coverage report, confirm that the service is running on the same computer, add its project/workspace or custom skill directory, and confirm that its plugin is registered. A cached package alone does not prove installation. Unsupported packages require manual review or a compatible portable package; the scanner does not silently drop files to force an import. If the source changes or a preview expires, scan again. If an import fails, successful rows stay saved and failed rows show a reason.
