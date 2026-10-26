# MVP verification

Updated on 26 October 2026 using Node.js 22.23.2.

## Passed checks

- TypeScript compilation (`npm run build`).
- Catalog and complete starter-package validation (`npm run validate`): 4 skills, 75 files.
- SDK-client walkthrough (`npm run demo`): stdio connection, discovery, search, instruction retrieval, revision-bound supporting-file read, and clean shutdown.
- Automated suite (`npm test`): **18 passed, 0 failed**, including standalone activation independent of collection toggles.
- Dependency audit after updating Zod to its patched 4.6.7 release: **0 reported vulnerabilities** at installation time.

The suite includes a real MCP SDK client over stdio from a different working directory and over stateless Streamable HTTP. It also checks invalid arguments, missing capabilities, empty search results, file traversal, symlinks, binary preservation, frozen snapshots, stale revisions, archived entries, cursor validation, duplicate local imports, and HTTP Origin/Host handling.

Project tests cover independent persisted selections, stale-write rejection, empty projects, disabled skill search/list/get/file filtering, live updates on an existing stdio connection, real project-scoped HTTP calls, UI write-token enforcement, and generated connection configuration.

Folder checks cover enabling/disabling all members atomically, preserving selections in other folders, rejected stale writes and unknown folders, and resulting visibility through a live MCP client. Browser checks confirm collapse/expand, whole-folder activation, and the mixed state after individually disabling a child.

Browser verification covered project creation, enable/disable controls, filter counts and empty states, persisted selection after reload, and the connection dialog. The temporary verification project was removed after checking; the starter project's original selection was restored.

Visual inspection covered the full desktop layout, the 649 px in-app panel, and a 390 × 844 px responsive viewport. A separate finish review identified focus loss during DOM replacement; persistent logical-focus restoration was added and accepted in the review's source-level verdict pass. A browser check then confirmed focus remains on the selected package-files tab after its pane is rebuilt.

## Scope

No AI-provider request, external app configuration, hosted deployment, native Skills extension activation, or execution of third-party skill scripts was performed. Retrieval works through the SDK client; your chosen assistant still needs to be connected using the project-specific configuration in the UI. Existing user `.vscode` files were preserved.

Local HTTP checks require permission to bind a loopback port if run in a sandbox. They bind only to 127.0.0.1 on an ephemeral port during tests and close the listener afterward.

Version 0.2.0 adds the Impeccable text snapshot and a separate `/guide.html` setup page with project configuration generated from the same connection API used by the library. The per-file supporting-content bound is now 2 MiB to include the upstream font catalog; the total package bound remains 8 MiB and 128 files.

The v0.2.0 browser pass checked the collection/standalone layout at desktop, 682 px panel, and 390 × 844 px responsive sizes. It checked Impeccable’s switch and restored the original selection, inspected its command explanation, followed the guide link, switched connection formats, and confirmed copy feedback. The separate finish reviewer returned `ship`; a follow-up source review accepted project propagation through the mobile guide link. Detector findings for tab and table boundaries were reviewed as intentional, with existing token advisories left unchanged.

## v0.3.0 marketplace and managed native activation

Verified 26 October 2026 using Node.js 22.23.2:

- `npm test`: **32 passed, 0 failed**. Includes website → real discovery MCP client → pinned import → all three native destinations → live project-scoped library MCP → disable/removal. A fixture discovery transport makes automated tests deterministic.
- Native tests cover shared project/collection switches, MCP-only defaults, unmanaged and edited-file conflicts, native parent/root symlinks, removing destination bindings while keeping MCP activation, rollback after a later destination appears, and startup recovery before and after the project-file commit point.
- Installer checks cover duplicate detection, changed commits, checksums, unsafe/reserved/duplicate paths, attribution, and HTTP 207 reporting when the package is saved but native activation fails. Existing unrelated files are preserved.
- TypeScript compilation and the unchanged starter catalog validate: **4 skills, 75 files**. The main project’s two enabled skills and absence of native bindings are preserved.
- Live provider verification through the separate MCP succeeded for all four rankings, keyword search, collection inspection and pinned package retrieval. Vercel linking provides local OIDC; no deployment or AI-provider call was made.
- Browser end-to-end test used a disposable library on port 3335 and the actual discovery service on 3334. A real public `find-skills` package at `a80e4c9d12d607631249d4d7d059f835d4b2f13a` installed into Codex, Claude Code and Cursor directories. Files and ownership markers were read from disk; disabling the collection removed all three copies and retained the saved package. The owner’s actual library was not changed by this test.
- Visual checks covered the 1269-pixel desktop IAB, 682 × 853 panel, and 390 × 844 Safari responsive layout, including a deliberately long sidebar label, live rankings, pinned detail view, destination dialog and success feedback. Captures are local under the ignored `.impeccable/review/` directory.
- The Impeccable detector ran once. Its primary findings were the incumbent tab-divider and table-wrapper boundaries; tabs/cells supply their own spacing. Existing token advisories were preserved. A separate fresh finish review accepted the visual system and layouts, and requested clearer pre-install wording; that copy now distinguishes disabled new installs, explicit enablement and existing selections.

Existing user `.vscode/` settings were left outside feature commits. Native coding agents were not launched, so a host may still need its documented reload/restart. No arbitrary repository setup script ran. Private repositories, automatic updates, global installations and custom installers remain outside this release.

The finish reviewer scored its single wording fix **resolved**, with disposition **ship** at that scope. Final desktop captures verified both new-install and existing-selection guidance. After the Mac was unlocked, final Safari captures at **390 × 844** verified the corrected prospective paragraph, project selector, unchecked native destinations and both contained action buttons. The reviewer confirmed the prior mobile recapture limitation is resolved. No fresh full-surface verdict is claimed for this fix pass. Final local evidence is saved as `.impeccable/review/mobile.png` and `mobile-dialog.png`; no installation or project-selection write was performed during this follow-up.

## v0.4.0 Trending collections

Verified on 26 October 2026. The library suite remains **32 passed**; the discovery suite now has **14 passed**, including grouping across provider pages, case-insensitive repository deduplication, distinct sampled counts, bounded scanning, pagination, real HTTP MCP grouping and immutable-blob cache expiry. TypeScript and browser JavaScript syntax checks pass.

Live website → discovery MCP checks returned 20 distinct collections on the first page from a 500-skill provider window. Matt Pocock's repository resolved to 38 verified skills with its actual repository description. Opening `ask-matt`, inspecting its pinned manifest and returning to the collection worked without installing anything. Existing project selections and native destinations were preserved.

Desktop collection and 390 × 844 ranking captures are saved locally. Final mobile collection and 682-pixel captures remain pending: GitHub's unauthenticated API limit was exhausted, followed by disabled local browser access. The previously validated desktop capture predates the final narrow-screen scroll adjustment. No final responsive approval or release tag is claimed while those captures are pending.

The separate Impeccable reviewer found one keyboard-focus issue: opening a collection member removed the focused button. A current-request-guarded finalizer now makes the resulting detail/error heading programmatically focusable and moves focus to it. The reviewer scored this single source fix **resolved**, disposition **ship** at that scope only. Runtime keyboard/assistive-technology behavior and the missing responsive captures remain unverified. The documentation comparison preserves the incumbent design system; no new visual tokens or raster assets were introduced.

### All collection views

The same collection UI now applies to Most installed, Hot now, keyword search and the existing GitHub stars repository results. `npm test` passes **33 library tests** and **18 discovery tests** (51 total). New checks exercise per-view grouped snapshots, original all-time/hourly metric labels, collection pagination across provider pages, bounded search grouping and first-match order, native GitHub pagination, default MCP compatibility, and the website's real discovery-MCP argument forwarding for all views and search pages. Browser JavaScript syntax and TypeScript compilation pass.

Live calls through the website owner API and actual discovery MCP returned 20 unique repositories on the first page of Most installed, Trending and Hot now, with the expected provider metrics and next page. No install or project-selection writes were performed. Browser control remained disabled, so current screenshots and the pending final responsive checks are not claimed.

Additional live checks returned 20 unique repositories for GitHub stars with native pagination and 17 unique collections from the first 48 `design` search matches, with no next collection page. These exercised the actual running services on ports 3333/3334 and did not modify the saved library.

### Collapsible shared navigation

On branch `feat/collapsible-sidebar`, all three pages now load the shared sidebar controller. `npm test`: **39 library tests passed**, including six behavior tests that execute the actual controller with a minimal DOM harness. They verify hidden/expanded state and accessible labels, persisted wide/narrow preferences, narrow-screen defaults, Escape focus return without intercepting open dialogs, resize/cross-tab synchronization and unavailable browser storage. The sixth check verifies that opening inline mobile navigation reveals its position and resets its internal scroll, without scrolling the wider sticky sidebar. Browser JavaScript syntax and TypeScript compilation pass. The first sandboxed full run could not bind local HTTP fixtures; after granting loopback/network permission, the complete suite passed.

The Impeccable detector ran once for this sidebar feature and returned no findings. This does not establish visual quality. Browser control explicitly remained disabled in Work settings; desktop, 682-pixel and mobile captures, actual browser keyboard/screen-reader behavior and final visual approval remain pending. No older screenshot is presented as proof of the new shell. The palette/type remain established; design documentation records the shared bar and navigation behavior. Existing library contents, project activation and editor settings were preserved.

The fresh Impeccable source review identified two sticky-header scroll regressions. Library detail panes now use a header-aware scroll margin, and opening inline mobile navigation reveals it even from a scrolled page. The reviewer scored both fixes resolved at source scope, with disposition **recapture** for the missing current visual evidence; current rendered verification remains pending recapture while browser control is disabled.


## v0.5.0 local scanner, privacy and grouped secondary navigation

Verified on 26 October 2026 using Node.js 22.23.2. `npm test`: **51 library tests passed**, including 12 scanner tests. TypeScript compilation, browser-script syntax checks, catalog validation and the real stdio MCP demo pass. Scanner fixtures cover supported global locations, nested/inherited/native project roots, configured/custom folders, plugin registration/manifests, cache opt-in, physical/content/source deduplication, source changes, unsupported packages, expiration, API write protection, partial outcomes and operation serialization. Attribution tests preserve both package and ancestor licenses even when names differ only by case.

The real owner-authorized import saved 154 packages with no import failures. Ten discovered packages were unsupported by the documented portable-format/size limits. Existing project selections remained byte-for-byte unchanged; new imports stayed disabled. The resulting local library validates at 158 skills and 995 files. A later scan through the actual running website API found no new ready packages in the same configured scope, and preserved project settings. Discovery remains bounded: location warnings/incomplete coverage are reported rather than interpreted as a complete computer inventory.

New imports now use Git-ignored `library/.local/` storage. Existing owner imports were moved there, with a local catalog backup. The versioned starter catalog retains four skills. Machine-specific `library/projects.json` was removed from the Git index while retaining the file on disk; fresh clones start with no profiles. Shared examples use generic absolute paths. Tests verify the public catalog stays unchanged after a private import, duplicate detection spans merged data, and generated example connection settings use placeholder paths and project IDs. A current-tree check found no owner identifiers in tracked files; this is not a history rewrite or a guarantee about prior commits.

Live HTTP checks confirmed version 0.5.0, the merged library, preserved original enabled selections, placeholder connection configuration, and all three pages serving secondary navigation under their corresponding page links. Marketplace ranking controls share the same state as the main ranking tabs. Guide sections start expanded. Connection panels show examples until the owner explicitly reveals local configuration.

The Impeccable detector ran once for this feature and returned no findings. Current desktop, 682-pixel and mobile captures cannot be obtained because local browser use is disabled in Work settings. The fresh finish reviewer returned **disposition: recapture**; stale prior captures are not used to approve this UI. Rendered responsiveness, keyboard/screen-reader operation and the complete browser scan/import flow remain pending. Source/API tests do not substitute for those checks. No release tag, push or deployment was performed.

### Sidebar scope correction

Removed duplicate Marketplace ranking navigation after the owner clarified that sidebar subnavigation is for page sections such as the MCP guide. Ranking filters remain in the main Marketplace content; guide sections and project navigation remain available. All 51 library tests pass, and live served-page checks confirm four main ranking filters, none in the sidebar, and retained guide contents. The first sandboxed run lacked localhost permission; the rerun with localhost access passed. No new rendered captures are claimed.

### General MCP guide and section tracking

The guide now uses generic collection/standalone descriptions, task placeholders and placeholder-only configuration examples. It does not request owner state, list saved projects or offer local-path disclosure. Working project configuration remains in the library’s Connect project dialog. Library links no longer attach a project query; the guide removes legacy project parameters while preserving section anchors. Marketplace authentication instructions refer to the user’s intended team/project rather than a fixed name.

`npm test`: **56 passed**, including five tests executing the actual guide script. They cover copying all example formats without owner requests, legacy URL cleanup, section tracking in both scroll directions, short final sections at page end, navigation-container-only scrolling, hidden/collapsed/mobile navigation, reopening and batched scroll/resize events. Browser JavaScript syntax and diff checks pass. Live served-page checks confirm generic examples and no owner-state requests. Local browser use is still disabled in Work settings, so current rendered scrolling, responsive layouts and screenshots remain unverified; no new visual approval is claimed.

### Persistent scan source inventory

`npm test`: **63 passed**, including five inventory integration tests and two tests for the actual library UI script/helper. Fixtures verify directory-based grouping of same-named projects, deduplicated skills with multiple source origins, persisted inventory after server recreation, narrower scans retaining other project observations, complete scans retiring covered missing sources, partial scans preserving historical last-seen observations, import-to-saved linkage without profile/activation changes, unsupported package visibility, foreign-origin rejection and corrupt inventory preservation. UI tests verify source-group filtering/search, provenance summaries, read-only source views, view restoration after reload, and returning to the full saved library. Script syntax, TypeScript, diff checks and catalog validation pass.

A live API refresh against the existing configured project/workspace scope saved 191 observed packages: 154 linked to saved skills, 27 not imported, and 10 unsupported. It found three project source groups plus global locations. The saved library remains 158 skills/995 files; the existing project profile retains its original two enabled skills and no native bindings. No packages were imported and no activation profiles were created. The private inventory is stored under ignored `.local` data; reports and source paths are not added to versioned starter data. Live served HTML includes the source navigation/panel and loads the browser inventory module.

Source views distinguish observed installations from saved library copies and explicit project activation. Global/project scope and platform are shown as compact summaries/status tags; expandable disclosures contain exact paths and last-seen times. Inventory reads do not trigger filesystem rescans. The real inventory persists independently of the transient 15-minute import preview.

The fresh Impeccable finish reviewer returned **disposition: recapture** for missing current desktop, mobile and 682-pixel captures. Browser access remains disabled in Work settings. Existing captures predate this source-inventory UI and are not evidence for it. Browser layout, real keyboard/screen-reader use and the complete interactive browser flow remain unverified; API/DOM-harness checks do not substitute for visual approval. No additional detector pass or release tag was created.
