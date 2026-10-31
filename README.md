# Personal Skill Library MCP

A small, local library of skills you choose. An AI assistant can search your collection, retrieve a workflow, and read its supporting files through four read-only MCP tools.

**v0.5.0:** a local browser library and marketplace, per-project MCP and managed native activation, four starter skills, stdio and localhost Streamable HTTP, a local importer, and Git-managed curation. Library retrieval requires no AI key. Live skills.sh discovery uses a linked Vercel project’s OIDC identity; no deployment is needed.

## Open the UI

```sh
npm run ui
```

Open **http://127.0.0.1:3333**. Choose a project in the sidebar, browse the full collection, and turn skills on or off for that project. The Enabled and Not enabled filters separate its selected and available skills. Select a row to inspect its instructions, supporting files, requirements, and GitHub provenance.

**Matt Pocock** is a collapsible collection containing three saved skills. **Impeccable** is one standalone skill with its own switch; its commands are part of that skill. Use the folder checkbox to enable or disable every currently saved skill in that folder, or expand it to choose individual skills. The checkbox shows a minus when only some are enabled; clicking that partial state enables the whole folder. Folder changes are atomic and affect all members, including skills hidden by a search/filter. Adding a skill later does not silently enable it for existing projects.

Open **MCP setup & usage** in the sidebar (or `/guide.html`) for a general guide with placeholder configuration examples, prompt templates, all four tools, and troubleshooting. It does not load saved project names or local paths; use **Connect project** in the library for working project-specific settings. The guide sidebar highlights the current section while scrolling.

Use **Create project** to add another profile. A profile's optional folder path is a label until you explicitly configure native destinations; that step validates the existing directory and manages selected skill copies there. The app does not automatically detect editor workspaces. New profiles start with zero enabled skills. The included Skill Library MCP profile starts with research and diagnosing-bugs enabled; code-review is saved but disabled for that profile.

Use **Connect project** to copy a configuration that binds an MCP client to that exact profile. It supplies JSON, a Codex TOML fragment, and a project-specific HTTP URL. No VS Code extension is installed: this implements the same per-project enable/disable interaction in a local web app.

With no projects yet, **Create project** is available in the main header and the three-step setup panel. In **Connect project**, **Check local stdio server** starts a temporary real MCP SDK client with the same executable, library directory and project ID as the working configuration. It checks the available selection, retrieves one instruction/file when a skill is enabled, and checks that a disabled skill is rejected when one exists. The check leaves project settings unchanged and returns no private paths or instruction text. It does not verify an external coding assistant, native host activation, or the HTTP transport; ask your assistant to list the enabled skills to verify its own connection.

Use the sidebar icon beside **Skill Library** to show or hide navigation. Hiding it gives the workspace the full width. The choice is remembered across the library, marketplace and guide, separately for wide and narrow screens. Navigation starts closed at 960 px and below; project selection remains available above the library. Escape closes navigation when focus is inside it and returns focus to the icon. Projects sit directly under Library, and section links sit under MCP guide. Marketplace rankings stay in the main page without duplicate sidebar controls. The guide's **On this page** disclosure starts open.

## Scan skills already on this computer

Use **Scan installed skills** in the library header. Choose global folders, projects, or both; filter platforms or choose one registered project. Add a workspace folder to discover unregistered/nested projects, or a custom skill folder for another platform. Review source paths, package problems and the coverage report, then import selected packages. New copies remain disabled for all projects, and the original installations are unchanged. After a scan, **Found on this computer** lists Global installations and each project where skill packages were observed. **All discovered** shows the combined inventory, including packages not imported or unsupported. **Library → All skills** remains the complete saved collection.

The scanner supports shared `.agents/skills`, Codex, Claude Code, Cursor and OpenCode locations. It respects the running service's `CODEX_HOME`, `CLAUDE_CONFIG_DIR` and `XDG_CONFIG_HOME` overrides, includes configured Codex skill paths, registered project directories/native roots, and inherited/nested repository locations. Enabled/registered plugin manifests limit which packages count as installed. Cursor caches and other unverified cached packages are opt-in and are never auto-selected. This inventory is local; it cannot verify host activation or cloud/remote accounts. It does not convert rules, commands or built-in system skills. No AI, network download or third-party setup script is used by scanning/importing.

The source inventory is persisted in ignored `library/.local/inventory.json` and survives reloads/restarts. Project identity uses its directory, so equal folder names do not merge different projects. A shared package can appear under several source locations without duplicating its library copy. Rows show Global/Project and platform identifiers; expand **Source locations** to inspect full paths and last-seen times. Source views are read-only and separate from **Project access**, where MCP/native activation is configured. The compact workspace selector also exposes source views when the sidebar is hidden.

Observations outside a narrower scan are retained with their own last-seen timestamps. Only a complete scan retires missing observations beneath roots it successfully checked. Partial scans keep prior observations; they are not proof that those installations still exist.

A saved copy is not updated automatically. Identical package bytes and physical aliases are deduplicated; same-named packages from different sources can remain distinct. Unsupported formats, linked package files, oversized packages, unreadable paths and bounded-scan limits appear in the report. Review dependencies before using a copied host-specific skill.

CLI equivalent (no package import unless `--import-all` is supplied; scans still update the private inventory):

```sh
npm run scan-skills
npm run scan-skills -- --scope projects --project-directory "/absolute/path/to/projects"
npm run scan-skills -- --skill-directory "/absolute/path/to/custom-skills" --import-all
```

`--import-all` imports only ready packages; cached-only packages require explicit selection in the website. CLI imports require restarting the website to reload its catalog. See [scanner design and coverage](docs/local-scanner.md).

## Local data and sharing

New imports from the scanner, marketplace and import CLI are stored in `library/.local/catalog.json` and `library/.local/packages/`. The loader merges these with the four shareable starter skills. The entire `.local` directory and `library/projects.json` are ignored by Git. Project settings may contain real directory paths, so keep them local; a fresh clone starts with no project profiles. `library/projects.example.json` provides the empty schema.

The guide always shows generic placeholder examples. The library’s **Connect project** dialog also defaults to examples; explicitly choose **Show local configuration** there to reveal working paths and the selected project ID. Scan previews show source paths needed to inspect your own machine. Do not paste those into public issues or screenshots. Shared examples use `/absolute/path/to/...` placeholders; replace them locally. Scanning makes no network requests, and private package contents are not sent to the discovery provider. Project-enabled MCP skills are intentionally made available to the coding assistant you connect.

These defaults protect new commits; they do not erase information already saved in old local Git history. Review staged files before publishing or sharing the repository.

## Marketplace and coding-app installations

Open **Marketplace** in the sidebar or [the local marketplace](http://127.0.0.1:3333/marketplace.html). The separate sibling repository [skill-marketplace-mcp](../skill-marketplace-mcp/README.md) provides four read-only discovery tools. Start it in another terminal:

```sh
cd "../skill-marketplace-mcp"
npm ci
npx vercel login
npx vercel link
npx vercel env pull .env.local
npm run dev
```

The documented skills.sh API needs a Vercel OIDC identity. Select the intended team/project when linking; credentials stay in the discovery backend’s ignored environment file. Discovery runs on **127.0.0.1:3334**, and the app calls its MCP endpoint server-side. Override `SKILL_MARKETPLACE_URL` only with another loopback HTTP endpoint. No AI model is called by either service.

Search skills or choose Most installed, Trending, Hot now, or GitHub stars. All tabs and keyword search show project collections. Most installed, Trending and Hot now group the first 500 provider-ranked skills, ordered by each project’s highest-ranked member. Search groups up to 50 matching skills in first-match order. GitHub stars already ranks whole repositories. Each collection appears once across the grouped pages. Click it to read the author’s project description and browse a compact skill picker, with one-line summaries and a route back from individual details. Sample counts describe matching or ranked members, not project downloads or the repository’s total skill count. Installs measure skills; GitHub stars measure repositories with the agent-skills topic. The UI preserves each provider’s metric and retrieval time, and shows failures instead of substituted data. Collections open a verified skill picker. Read the instructions and repository setup, then install a pinned public GitHub package.

**Install** saves a new skill disabled. **Install & enable for project** also activates it. Existing installations preserve their selection on ordinary installation. Native copies require an explicit project selection and a validated absolute directory. Choose Codex (`.agents/skills`), Claude Code (`.claude/skills`) and/or Cursor (`.cursor/skills`). Existing library skills offer the same setup in their detail pane. Clearing every destination removes managed copies while retaining MCP activation.

Reinstalling an existing source/path is supported only for the same saved commit. If the reviewed commit differs, Marketplace links to **Review update** in Library settings and ordinary installation is rejected with `UPDATE_REVIEW_REQUIRED`. Use the separate review/apply workflow to update explicitly; there is no automatic update. Imported requirements remain **unknown** until assessed; the author's compatibility note is shown separately and does not verify runtime access or complete dependencies.

The project and collection switches update both MCP availability and configured native copies. Packages are staged, content-checked and commit-pinned, with licenses retained. The app marks its own copies, refuses conflicting or edited files, and serializes changes with a process lock. An interrupted transaction rolls back or finalizes on server startup according to the saved project commit. An installation can be saved to the library while native activation fails; the UI explicitly reports that partial outcome. Preserve recovery journals/staging folders if recovery itself reports a conflict.

Reload your coding agent when its native skill list has not refreshed. Already-loaded instructions cannot be withdrawn from an existing conversation. Repository setup is shown separately and never executed by installation. Private repositories, global installation, automatic updates and custom installers are deferred.

See the [in-app setup and troubleshooting guide](http://127.0.0.1:3333/guide.html#marketplace-setup) and [architecture](docs/marketplace.md).

## How project activation works

- Profile selections are stored in `library/projects.json`, independently of the global catalog.
- For stdio, set `SKILL_LIBRARY_PROJECT` to the profile ID. The connection dialog includes it and the absolute library path automatically.
- For HTTP, use `/mcp?project=<profile-id>`; the connection dialog supplies the full URL.
- Project connections filter all four retrieval tools, including direct reads by a known disabled ID. Unknown profile IDs fail; they never fall back to the full library.
- Existing project connections read the latest selections for each tool call. Toggling availability does not require a reconnect, but it cannot remove instructions the assistant already loaded into its conversation.
- Connections without a project setting keep the original full-library behavior. To apply project filtering, use the configuration from **Connect project**, rather than the unscoped examples below.
- This is a local curation feature, not an access-control boundary against an assistant with separate filesystem or shell access to your computer.

Package bytes are frozen within a loaded snapshot. Marketplace imports refresh the website and HTTP snapshot immediately. Reconnect existing stdio clients after importing new packages; selection changes remain live. External catalog or package edits require restarting the server.

## Try it in one minute

Node.js 22 or later is required. From this repository:

```sh
npm ci
npm run build
npm run demo
```

The demo launches a real MCP server as a child process, discovers its tools, searches for a debugging skill, loads the instructions, reads its license from the same revision, and exits. It does not call a model or run the skill's scripts.

To browse the actual contents:

```sh
npm run browse
npm run browse -- search "debugging"
npm run browse -- get mattpocock/research
npm run validate
```

The browse commands print JSON so you can inspect full metadata and tool outputs. `npm run demo` prints a shorter walkthrough.

## Connect an AI client

Use **stdio** for a local coding assistant. It starts the server automatically; you do not need to run `npm start` in a separate terminal.

For a client that uses `mcpServers` JSON, merge the example in [examples/mcp.json](examples/mcp.json) into its MCP configuration. The command should point to Node.js and the argument should point to this repo's compiled server:

```json
{
  "mcpServers": {
    "skill-library": {
      "command": "node",
      "args": ["/absolute/path/to/skill-library-mcp/dist/stdio.js"]
    }
  }
}
```

If the desktop application cannot find `node`, replace `command` with the absolute executable printed by `node -p process.execPath` in your terminal. The server resolves its library relative to its own location, so the client's working directory does not matter.

For Codex, [examples/codex-config.toml](examples/codex-config.toml) contains a fragment you can merge into your existing configuration:

```toml
[mcp_servers.skill_library]
command = "node"
args = ["/absolute/path/to/skill-library-mcp/dist/stdio.js"]
```

Codex documents MCP setup in its [official connection guide](https://developers.openai.com/codex/mcp). These examples do not modify your existing app configuration automatically. After adding the server, restart/reconnect it in your client and confirm that all four tools are listed.

Then ask:

> Search my skill library for a debugging workflow. Tell me its requirements, load it, and use it to investigate this error: …

Or:

> List my saved skills. Use mattpocock/research to investigate this API and save a cited report.

The assistant needs its own web, file, shell, or subagent capabilities to perform a skill. The MCP tools supply instructions and packaged files. Optional native copies are configured explicitly through the owner UI; they do not supply missing agent capabilities or run setup scripts.

## Optional HTTP endpoint

```sh
npm run http
```

- MCP endpoint: `http://127.0.0.1:3333/mcp`
- Browser UI: `http://127.0.0.1:3333`
- Health: `http://127.0.0.1:3333/health`
- `PORT=4444 npm run http` changes the port.
- Use a client that supports **Streamable HTTP**, not legacy SSE.
- The server binds only to `127.0.0.1`; Host checks and browser Origin checks are enabled.
- This local endpoint has no user authentication. Do not expose it through a public tunnel or deploy it as a private remote service without adding authentication.
- Prefer stdio for ordinary local assistant connections. Origin/Host checks and the owner UI write token do not authenticate local processes: a process that reaches the optional HTTP MCP can request the unscoped library. This mode assumes trusted local processes; broader distribution needs a separate HTTP access-token or restricted-IPC decision.

HTTP is stateless: each POST gets a fresh protocol transport over the current catalog snapshot, with live project-selection filtering when configured. There is no persistent GET stream. The test suite checks a real MCP SDK client against both transports. The owner-side UI API imports packages, writes project profiles and manages explicitly configured native copies; MCP tools remain read-only. UI changes require a same-origin write token and are saved atomically with conflict checks.

## Included collection

| Skill ID | Use | Known requirements |
| --- | --- | --- |
| `mattpocock/research` | Primary-source research saved as cited Markdown. | Web access, filesystem, subagents. |
| `mattpocock/diagnosing-bugs` | Reproduction-first debugging and verification. | Shell, filesystem, suitable project runtime. |
| `mattpocock/code-review` | Review standards and specification separately. | Git/shell, filesystem, subagents; may require tracker setup. |

These are verbatim copies of the installed Matt Pocock plugin snapshot, including its supporting files, with the upstream MIT license included in each package. The catalog records upstream commit `5beb35b040e3de97e54fa9e386d7e42d15c295c2` and bundle version `1.3.1`. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Requirements are curator notes, not a complete dependency resolver. Some skill instructions reference other skills or project setup that is not bundled in this curated MVP. An assistant should report a missing dependency or use an explicitly adapted skill; retrieving instructions does not make every workflow runnable in every host.

## Add a skill you like

First inspect the source skill directory. Include all required references, scripts, assets, and applicable license files. Then copy the complete package into your library using the local command:

```sh
npm run import-skill -- \
  --from "/absolute/path/to/my-skill" \
  --id "personal/my-skill" \
  --tags "review,quality" \
  --requirements "shell,filesystem" \
  --notes "My preferred workflow for reviewing changes"
```

Optional provenance flags: `--source-url "https://github.com/author/repo"` and `--commit "<resolved-commit-sha>"`. Without a URL the source is recorded as `local:import`. This command imports local files only; it does not download or execute a GitHub repository.

Use `--folder "Collection name"` when importing into a collection, or `--standalone` for one independently displayed skill. Unspecified collection labels default to General skills. Existing entries can be organized by editing their `folder` field in `library/catalog.json` and restarting the server. Folder names are catalog labels; they do not move or rewrite skill packages.

The skill directory name must match the frontmatter `name`. The command validates the package, rejects symbolic links, stores the bytes under a content-derived path, and updates `library/catalog.json`. Existing IDs are rejected. Inspect and commit the changes in Git, then restart running server processes.

To organize the collection, edit the entry in `library/catalog.json`:

- `tags`: searchable labels.
- `personal_notes`: why you like the skill or important caveats.
- `preferred`: prioritizes ties in search.
- `requirements`: capability names you want clients to check.
- `status`: set `archived` to hide it from discovery and retrieval, or `active` to restore it.

Run `npm run validate` after editing. For a content update, retain the old package in Git, import the new package using a distinct ID or deliberately change the existing catalog package pointer, validate, commit, and restart. There is no automatic upstream sync.

## How revisions work

Every process loads a frozen in-memory snapshot at startup; the HTTP app replaces its snapshot after a successful Marketplace import. A skill revision hashes its complete ordered file manifest. `get_skill` returns that revision; `read_skill_file` requires it. Editing files on disk cannot silently change bytes a running task reads. A restarted server computes a new revision when package contents change.

Only the current catalog snapshot is served by one process. Old revision requests return `REVISION_NOT_FOUND`; use Git to recover older packages. External catalog edits, CLI imports, and content changes take effect after restarting the server. Marketplace imports refresh the running HTTP app; existing stdio clients require reconnecting.

Search uses deterministic keyword matching over names, descriptions, tags, and notes. It does not use embeddings or an LLM. Results can legitimately be empty. The capability check compares only the requirements you recorded; omitted capability information returns `unknown`.

## Tool reference and documentation

- [Implemented tools](docs/tools.md): actual MVP inputs, outputs, error behavior, and examples.
- [Design proposal](docs/design-proposal.md): the larger researched design, including future management tools and native MCP Skills support. It is a proposal, not the shipped feature list.
- [Verification](docs/verification.md): checks run for this handoff.

## Public Vercel demo

The root Vercel entry point serves a separate sample-data demo. It never loads the real owner library, project settings or scan inventory. Live marketplace discovery comes from the separately hosted service. Scan/import/native installation stay local-only; example project selections affect this browser only. See [deployment and privacy boundaries](docs/vercel-demo.md).

## Development

```sh
npm run check
npm test
npm run validate
npm run demo
```

Tests cover real stdio/HTTP MCP calls, strict input validation, path traversal and symlink rejection, binary files, pagination, stale revisions, frozen snapshots, archived skills, and local imports. Runtime file limits: 128 files, 8 MiB total, 2 MiB per file, 256 KiB for `SKILL.md`, 256 directories, 16 directory levels. These are application limits, not MCP specification limits.

Set `SKILL_LIBRARY_DIR` to an absolute directory containing another `catalog.json` and its packages to use a different collection. Both stdio and HTTP use this setting. Keep logs off stdout for stdio; diagnostic messages go to stderr.

The SDK v1 compatibility interface is intentionally used for this local MVP. The native MCP Skills extension, remote authentication, MCP-based management tools, automatic skill execution, a native VS Code extension, and Vercel deployment are not implemented. UI browsing and project activation are implemented.

## Releases and Git

The package version and CHANGELOG.md track releases. Use feature branches and conventional commit messages, run `npm test` and `npm run validate`, then tag a verified release with its matching semantic version. Tags are local until explicitly pushed. Existing user editor files remain outside the feature commits.

### Impeccable package

The saved Impeccable 4.7.0 text snapshot includes its original instructions, references, script sources, Apache-2.0 license, and third-party notices. The platform engine binary is excluded; helper-dependent commands require a compatible local engine. Its upstream commit has not been verified, so its GitHub link opens the source repository instead of claiming a pinned commit. See `library/packages/impeccable/PACKAGE-NOTE.md`.

## Source repository

The public source includes application code, tests, documentation and npm manifests. Dependencies are installed locally with `npm ci`; `node_modules`, generated builds, environment files, local editor settings and private runtime data are excluded from Git. CI runs type checking and the test suite on Node.js 24. See [contributing](CONTRIBUTING.md) for the branch and commit workflow.

## Local maintenance and release controls

Open **Library settings** for project rename/archive/restore, curator notes/tags/favorites, saved-skill archiving, snapshot refresh, status and private backups. Native destination settings now require **Preview changes** before applying; exact paths and conflicts are shown. Selection Undo uses the last saved project revision and preserves native conflict checks.

**Download private backup** exports current packages/profiles, including private contents and paths. **Preview restore** validates the archive before applying. Restore merges missing packages and creates path-free profiles with no native bindings; conflicting saved bytes are never overwritten. Source inventory, old rollback history and credentials are excluded. A profile-stage failure is reported separately from saved packages.

For public GitHub packages, enter a reviewed 40-character commit in Library settings, inspect changed files and before/after text, then apply explicitly. Rollback restores a retained earlier revision. Disable enabled managed native copies first; update/rollback never silently replaces them. Reconnect stdio clients after package changes.

`npm run local` builds and starts the library. Add `-- --marketplace` to launch the already-built/authenticated sibling discovery process as well. `MARKETPLACE_PORT` can differ from the library's `PORT`. Both processes stop together. `npm run ui` remains supported.

An optional private `SKILL_LIBRARY_HTTP_TOKEN` (64 lowercase hex characters) requires a Bearer header on HTTP MCP requests. Working HTTP connection settings include the header after explicitly revealing local configuration. Default HTTP mode still assumes trusted local processes, and the owner UI is not a multi-user authentication system. Prefer stdio and never tunnel the owner API.

Package snapshots default to a 128 MiB aggregate byte budget; `SKILL_LIBRARY_MAX_BYTES` may deliberately set a value from 1 MiB to 1 GiB. Portable backups are limited to 64 MiB. `npm run benchmark` measures synthetic metadata workloads. Linux/macOS Node 22/24 CI is defined; Windows/native-host behavior needs separate qualification. See [the implementation record](docs/audit-2026-10-27/IMPLEMENTATION.md) for guarantees, caveats and verification.
