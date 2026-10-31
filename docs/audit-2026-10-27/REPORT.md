# Skill Library: product, design, functionality, and production review

**Implementation update — 31 October 2026:** the local-app roadmap has a new [implementation and verification record](IMPLEMENTATION.md), including maintenance workflows, native previews, backup/restore, reviewed updates/rollback, safe undo, diagnostics, Unicode search and release safeguards. The findings and test totals below describe the 27 October baseline; use the implementation record for current behavior and remaining qualification work.

Reviewed 27 October 2026. Scope: the current working tree of `skill-library-mcp` (package 0.5.0), plus its sibling `skill-marketplace-mcp` (package 0.2.0). This includes uncommitted source restructuring; the review is not limited to the last commit. The first pass inspected the application. A subsequent primary-source review and implementation pass on the same date added the fixes recorded below. No deployment was performed.

Companion: [primary-source research](PRIMARY-SOURCE-RESEARCH.md).

## Current status after research and implementation

The numbered findings preserve the initial audit baseline; screenshot artifacts were removed from this source repository. The following changes are now implemented; recommendations not listed here remain proposed work.

| Finding | Implemented correction | Evidence / remaining limit |
| --- | --- | --- |
| D1: first use | Visible Create project action and three-step setup guidance | Browser creation completed in a disposable library |
| D3: control names | Concise “Inspect [skill]” labels separate inspection from enable switches | Browser accessibility tree confirms names; full screen-reader testing remains |
| D5: connection confidence | Check local stdio server launches a real SDK client with the generated project configuration | Checks tool discovery, paginated scope, instructions/file retrieval when available, and rejection of one disabled ID; does not verify an external assistant or HTTP client |
| Dialog naming | Explicit title associations on Create project and Connect project | Named dialogs observed in browser; native dialog behavior still needs broader accessibility QA |
| F1: requirements | Unknown assessment stays unknown even if supplied capabilities match; author compatibility text is preserved and displayed verbatim | Regression tests cover legacy, unknown, and explicit assessed-empty lists; no runtime verification implied |
| F2: commit mismatch | UI distinguishes saved/reviewed commits and disables unsupported updates; server returns `UPDATE_REVIEW_REQUIRED` with no activation | Regression checks preserve saved commit and project selection; full update/diff/rollback remains deferred |

The check endpoint requires the owner write token, serializes checks, rejects stale project revisions, and returns a bounded summary without paths or instruction text. It starts the existing local library executable, not any third-party skill scripts. A zero-skill result is explicitly reported as not having tested instruction/file retrieval. Checks are on demand and do not introduce telemetry or a persistent “connected” badge.

Primary sources changed the release priorities: prefer stdio for ordinary local connections, and make the local HTTP authentication/trusted-process decision explicit before broad distribution. Native copies need host-specific verification. These are separate from the fixes implemented here. See [research findings and sources](PRIMARY-SOURCE-RESEARCH.md).

## 1. Overall assessment

The strongest product idea is **a personal, reproducible skill collection with an explicit selection for each project**. Discovery is useful, but the durable value is knowing what is saved, where it came from, and what each assistant can retrieve. The app already has meaningful engineering behind that promise: read-only MCP tools, revision-bound files, project filtering on direct reads, atomic configuration changes, and recoverable native activation.

The interface has a coherent editor-style shell, restrained colors, useful collection grouping, and explicit selection feedback. It is credible as a developer tool. The principal product objective is to make the journey from “I opened the app” to “my assistant successfully retrieved the intended skill” visible and verifiable. The new local stdio diagnostic addresses part of this gap; external-client verification and lifecycle controls still need work.

**Release judgment:** a strong local developer MVP with good automated coverage. A wider local beta needs better setup, diagnostics, lifecycle management, accessibility verification, and recovery operations. A hosted multi-user product needs a separate security and persistence design. The existing hosted entry point is an isolated sample-data demo, not the local owner application deployed remotely.

This is an expert inspection, not customer research. User wishes below are hypotheses to validate, not claims from interviews or usage analytics.

## 2. Evidence and limits

### Verification performed in this review

| Check | Result | Meaning |
| --- | --- | --- |
| Library `npm test` | 70 passed, 0 failed after the fixes | Includes real SDK transports, project scopes, scanner/inventory, native transactions, UI harnesses, and demo isolation |
| Marketplace `npm test` | 20 passed, 0 failed | Includes provider fixtures, collection grouping, package inspection, MCP, and hosted service behavior |
| TypeScript `npm run check` | Passed in both repositories | Current source type-checks |
| Library `npm run validate` | Passed against the merged local library | Current saved catalog and package contents validate; browser captures use a disposable library with four starter skills plus one later synthetic package |
| Browser | In-app browser, approximately 1269 × 714 | Seven baseline screenshots plus revised captures; saved files inspected |
| Browser data | Disposable starter library on loopback port 3345 | Created disposable projects and enabled Research; owner profiles and native destinations were not changed |
| External discovery | No live provider contacted | Baseline unavailable state and subsequent deterministic marketplace fixture verified; no live provider browsing/download is claimed |

The mechanical design scan also ran once. It flagged existing tab-divider padding and modal border/shadow patterns, plus design-token advisories; the new list/detail and dialog changes retain the incumbent system. This is not a clean-scan or full-accessibility certification.

The first sandboxed test attempt could not bind loopback ports. After running with loopback permission, both suites passed. Those initial failures are environment restrictions, not evidence of broken application behavior.

Native writes and scan imports were exercised by automated fixtures. The new setup check exercised the generated local stdio process settings with a real SDK client. In the browser, only their setup dialogs were inspected. This review did not scan the owner's home directory, install public packages, launch coding agents, configure or verify an external coding assistant, deploy a service, conduct penetration testing, benchmark large libraries, or verify mobile layouts and screen readers. Historical claims in `docs/verification.md` are not fresh evidence for this review.

### Baseline captured journey

| Step | Action | Health |
| --- | --- | --- |
| 1 | Open a fresh library with four starter skills and no projects | Usable; weak first-action hierarchy |
| 2 | Create a project, expand a collection, inspect and enable Research | Clear state feedback; dense details |
| 3 | Open Connect project | Privacy-conscious; setup success remains unverified |
| 4 | Inspect native destination settings, then cancel | Safe intent; destination effects need a preview |
| 5 | Inspect scan scope, then close without scanning | Good scope disclosure; terminology is demanding |
| 6 | Open Marketplace while discovery is stopped | Honest failure; recovery requires terminal setup |
| 7 | Follow Setup guide to marketplace instructions | Comprehensive; long operational detour |

### Review evidence

Browser checks used disposable data. Requirement and revision states used a deterministic local provider fixture, rather than live marketplace results. Screenshot artifacts are intentionally excluded from the source repository.

## 3. Design and UX critique (baseline findings)

### Step 1: first use

**What works:** navigation, search, collection counts, and the empty detail pane establish a recognizable browse-and-inspect model. The UI explains that a project controls availability.

**Finding D1 — addressed in this pass; original P1: the primary journey is underemphasized.** With no projects, “Scan installed skills” is the most prominent action while project creation is a small plus in the sidebar. The empty detail pane instructs users to enable a collection even though enable controls are absent in this global view. A beginner has to infer the prerequisite.

**Change:** replace the initial detail placeholder with a short setup sequence: “Create a project → choose skills → connect your assistant.” Offer a visible Create project button and a secondary Browse first action. Keep scanning available as an optional import path. Acceptance: a first-time participant can find project creation without help and explain why enabling is unavailable in All skills.

**Accessibility risk:** the plus has an accessible name, but its visual meaning and small target deserve keyboard, touch, and zoom testing. An accessible label alone does not make the action discoverable.

### Step 2: selecting and enabling skills

**What works:** the project count becomes one, the folder becomes mixed, both skill switches agree, and feedback names the affected project. This is a strong interaction. Keep the distinct collection disclosure and bulk activation control.

**Finding D2 — P1: too many concepts compete in the detail pane.** Description, availability, native installation, notes, requirements, provenance, instructions, and supporting files are valuable, but the explanation is verbose. At the captured height, source and instructions fall below the viewport. Long author descriptions consume the space needed for decisions.

**Change:** place a compact decision summary first: purpose, availability, requirements status, source/revision. Follow it with Overview, Instructions, Files, and Source sections. Use curated one-line summaries in rows while retaining verbatim instructions in the inspector. Offer safely rendered Markdown alongside a raw source view; rendering requires sanitization and safe link handling.

**Finding D3 — naming improved; further assistive-technology QA remains, original P2: selection and activation use confusing semantics.** The accessibility tree exposes skill selection as a checkbox, while a separate switch controls activation. Source confirms the select control uses `aria-pressed`; this browser represents it as a checkbox. A screen-reader review must determine whether users distinguish “selected for inspection” from “enabled for this project.” The current long accessible name also includes the full description and tags.

**Change:** retain native button semantics with a concise name for inspection, and a separately named switch for activation. Add descriptions through `aria-describedby` where appropriate. Validate with an actual screen reader rather than inferring behavior from the tree.

**Finding D4 — P1: bulk scope is consequential but mostly explained in supporting copy.** Collection changes include members hidden by filters. Preserve that deliberate behavior, but show “Enable all 3 skills, including 2 outside this filter” near a bulk action when relevant. Add an Undo action that safely uses the latest project revision; do not bypass native conflict checks to implement undo.

### Step 3: connecting an assistant

**What works:** client formats are explicit and working private paths require a deliberate reveal. The general guide remains shareable.

**Finding D5 — partially addressed by a real local stdio check; original P1: copying configuration is not a completed connection.** The default primary action copies a placeholder example. The heading promises to connect this project, but at the baseline there was no connection test, observed client identity, or last successful retrieval. The new local stdio check closes the internal-server part of that gap; external-client identity and retrieval history remain unobserved. Users can copy a plausible block and still have a nonworking setup.

**Change:** distinguish “Shareable example” and “Configure this computer” as explicit modes. Preserve the private-path opt-in. In local mode, provide a short sequence: copy settings, open the client's documented configuration location, reconnect, then run a diagnostic prompt. Show precisely what a diagnostic proves: an internal SDK probe proves server behavior; an observed external client call proves a client reached it; neither proves the model applied the workflow correctly.

Suggested status language: “Configured; client not yet observed,” “Last MCP request received 2 minutes ago,” and “Available on the next request.” Do not infer connection success from clipboard activity or a successful local probe.

### Step 4: native coding-app copies

**What works:** the form separates project directory and coding-app choices and explains that the project switch manages native copies as well as MCP access. It does not run upstream setup commands.

**Finding D6 — P1: side effects are not concrete before save.** Users provide an absolute path and select applications but do not see a per-destination plan. The earlier optional project path is described as a label; this path is an actual filesystem write target.

**Change:** add validation and a dry-run preview: exact target folder, create/remove/unchanged action, managed ownership, conflict reason, and reload advice. For example, an enabled skill targeting Codex should preview `<project>/.agents/skills/research`. Show that disabling removes managed copies and that clearing destinations can retain MCP activation. Acceptance: users can predict which folders change before saving, and a conflict preview never authorizes overwriting edited content.

### Step 5: scanning and inventory

**What works:** platform scope and cached-package opt-in are explicit. Copying to the library is separate from activation. Source code carefully retains observations outside a partial scan and records last-seen times.

**Finding D7 — P2: “installed,” “found,” “saved,” and “enabled” need a shared vocabulary.** A package on disk may be unsupported, cached, saved elsewhere, or unavailable to the current client. The product explains these differences, but users must repeatedly reconstruct them.

**Change:** use consistent labels: Found on disk, Saved in library, Available to project, Managed native copy, and Runtime not verified. Display scan scope, last seen, incomplete coverage, and expiry together. Add cancel/progress for long scans and a clear “scan again” recovery when a 15-minute review plan expires. Browser scan results and cancellation were not exercised in this review.

### Step 6: marketplace unavailable

**What works:** the app reports an unavailable dependency, gives Retry and Setup guide, and does not fabricate results. The local library remains a separate useful surface.

**Finding D8 — P1: two-repository setup leaks into the core experience.** A normal visitor reaches a dead end requiring another process and provider authentication. The empty inspector still says to choose a collection while the results pane cannot supply one.

**Change:** show dependency diagnostics: discovery process reachable, provider credential present/expired, GitHub quota when known. Supply a single launcher for both local services, while keeping discovery optional. If a process is missing, name that condition directly; if a provider credential is missing, avoid presenting it as an installation failure. Keep a working Return to library action. Do not silently restart services or expose credentials in diagnostics.

Successful ranking, collection, package, and install screens were not available in this capture run. Their code and tests were reviewed, but that browser observation supports only the failure-state finding.

### Step 7: guide

**What works:** documentation explains two services, provenance, sampling, caching, activation, and recovery. Generic examples avoid owner-specific paths.

**Finding D9 — P2: the guide is carrying too much onboarding responsibility.** The setup section contains a substantial command sequence and provider explanation. Move environment diagnostics into the application; keep conceptual and advanced material in the guide. Use numbered tasks, an expected result after each task, and copyable commands. Standardize reproducible dependency setup on the repository's documented `npm ci` flow rather than alternating with `npm install`.

The captured guide shows Marketplace setup in the article while the sidebar highlights What runs where. This is a possible anchor/scroll-tracking timing issue, not a proven persistent defect. Reproduce after anchor navigation and scrolling before changing the controller.

### Visual system and accessibility priorities

Keep the existing typography, blue accent, neutral surfaces, and list/detail composition. A branding overhaul would contribute less than clearer task hierarchy. Reduce repeated prose; make operational status easier to scan. Prioritize work at the viewport sizes developers use beside an editor, not only wide desktop screenshots.

Existing source includes skip links, focus styles, reduced-motion rules, labeled switches, live feedback, and focus-restoration logic. Still verify dialog names (title associations for `create-dialog` and `connect-dialog` were added in this pass), focus return, Space/Enter behavior, tab order after rerender, nested scrolling, 200%/400% zoom, touch targets, and contrast. The documented 32 × 19 switch track is a reason to measure the actual hit area, not proof of a standards violation. No accessibility compliance claim follows from these screenshots.

## 4. Functional and architecture assessment

### What currently works together

The browser talks to a local Express owner API. `LibraryApplication` coordinates scanner/import/marketplace workflows and swaps library snapshots after imports. `SkillLibrary` loads validated packages into memory and exposes metadata search, pagination, instructions, and manifested file bytes. `ProjectStore` stores selected IDs and native bindings, applies optimistic revisions, and filters the library for project-scoped MCP requests.

The coding assistant uses four read-only MCP tools over stdio or stateless Streamable HTTP. It executes workflows with its own capabilities. The app does not call an LLM to retrieve a saved skill. Discovery uses a second MCP service, which queries provider APIs and GitHub. Installing from discovery is a separate owner operation that pins a commit, checks content, saves privately, and optionally activates it.

### Practical host and protocol boundaries

The Agent Skills format does not define a universal machine-readable dependency taxonomy. Its optional compatibility declaration is free text, and tool declarations are host-dependent. Preserve source bytes; describe a rejected package as unsupported by this importer rather than universally invalid for every host. Native host extensions may behave differently from instructions delivered through MCP. [Agent Skills specification](https://agentskills.io/specification), [integration guide](https://agentskills.io/client-implementation/adding-skills-support), [Claude Code skills](https://code.claude.com/docs/en/skills).

MCP annotations describe a tool but are not enforcement. Project filtering and read-only implementations enforce this application’s behavior. Stateless HTTP JSON responses with no persistent GET stream are a valid transport choice; the protocol does not require adding streaming for its own sake. [MCP tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools), [MCP transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

### Strengths to preserve

| Design choice | Why it matters |
| --- | --- |
| Metadata → instructions → individual files | Avoids loading every package into the model context |
| Revision plus manifest checks | Instructions and references come from the same loaded content snapshot |
| Filtering on all four tools | Knowing a disabled ID does not bypass the connected project's selection |
| Unknown project fails closed | A mistyped project does not silently get the full collection |
| Separate owner writes and agent reads | An MCP retrieval cannot directly install or activate packages |
| Native ownership markers and content checks | Edited/unmanaged destinations are preserved |
| Journal plus atomic project-file commit | Interrupted filesystem changes can recover according to committed project state |
| Private imports and inventory ignored by Git | Ordinary repository sharing excludes owner package copies and machine paths |
| Separate synthetic demo factory | Public demonstration does not need to load the real owner catalog |
| Provider metrics and timestamps preserved | Repository stars and sampled skill installs are not presented as equivalent quality scores |

### Functional gaps and improvements

**F1 — fixed in this pass; original P1: requirements certainty was lost on marketplace import.** Previously, `saveMarketplacePackage` wrote an empty requirements list without assessment evidence, and search reported compatible whenever no listed requirements were missing. Imports now record `requirements_assessment: unknown`, and that assessment remains unknown in search results even with supplied capabilities. The regression tests prevent an unassessed empty list from implying compatibility. The remaining compatible label is explicitly limited to assessed curator-listed capabilities, not overall runtime compatibility.

Implemented evidence states are `unknown` and `curator_listed`; legacy nonempty curator lists retain existing behavior, while legacy empty lists become unknown. Explicitly assessed empty lists are supported. Author compatibility remains a separate free-text declaration. Runtime checks would require a separate evidence record. [Agent Skills specification](https://agentskills.io/specification). Return unknown when requirements are unassessed. Acceptance: a fixture with no assessed requirements never returns an unqualified compatible result.

**F2 — mismatch now blocked; full update support remains P1: reinstall is not an update mechanism.** Previously, duplicate detection returned the existing ID even if the reviewed commit differed. The current server refuses that mismatch before activation, and the UI shows saved versus reviewed commits with Update unavailable. This protects reproducibility but can disappoint someone who just reviewed a newer commit. The revision distinction is now explicit. Implement update review, file diff, dependency changes, backup, approval, native conflict checks, and rollback as a distinct operation. Do not silently repurpose Install.

**F3 — P1: project and package lifecycle controls are incomplete.** Current local routes create projects and change selections/native bindings. They do not provide project rename/delete, library removal, editable notes/favorites/tags, or a complete update/rollback workflow. Catalog fields exist, but several require manual file edits. Implement rename and export first, then archive/delete with dependency and managed-file consequences shown before confirmation. Keep destructive operations separate from enable/disable.

**F4 — P1: refresh behavior depends on the transport.** Project selection is read live, while stdio package snapshots remain frozen until reconnect. HTTP imports refresh in process; external edits require restart. Make these states visible. Prefer an explicit refresh operation with generation IDs and stale-client diagnostics before adding a filesystem watcher. Existing content already in a conversation cannot be revoked.

**F5 — P2: search has predictable limitations.** Local search uses ASCII tokenization, substring matches, and fixed field weights. It is easy to explain but lacks multilingual matching, typo tolerance, synonyms, and a measured relevance benchmark. Frontend library search and MCP matching should have documented semantics. Create a task-query fixture set before adding embeddings. Semantic retrieval is a candidate only if it improves measured selection quality enough to justify privacy, cost, and complexity.

**F6 — P1: error and partial-success behavior needs a durable operation result.** HTTP 207 intentionally represents “saved to library; activation failed.” Preserve that distinction. Add an operation ID and per-stage results so refresh/retry does not obscure the saved package. Explain recovery with actionable conflict paths locally and a redacted support export. Do not turn a partial outcome into a generic failed toast.

**F7 — P2: frontend maintenance is harder than necessary.** Feature separation in TypeScript is sensible. In contrast, marketplace rendering, network calls, dialog state, and install state sit in a heavily compressed JavaScript file with long HTML templates. Reformat first, introduce JSDoc or TypeScript API contracts, then split state/API/rendering/installation into focused modules. Centralize escaping and URL policies. A framework migration is optional; consistency and readable boundaries are the immediate need.

**F8 — P1 before larger catalogs: memory and reload cost are unmeasured.** Every loaded file is retained in a `Buffer` map. A 1000-entry limit with an 8 MiB package cap permits approximately 7.8 GiB of raw package bytes before runtime overhead; that is an upper bound, not observed use. Import validates/reloads the full library. Benchmark 100/500/1000 representative packages, set an aggregate budget, and consider content-addressed on-demand reads with a bounded cache while preserving revision consistency.

**F9 — P1 before broader local release: recovery is process-aware, not proven power-loss durable.** Journals, staging, hashes, and renames are useful safeguards. The inspected writers do not explicitly fsync files/directories. Do not describe the implementation as guaranteeing durability after power loss. Add disk-full, permission-loss, corrupted-journal, process-kill, and staged-file-edit fault tests; document the exact guarantees and supported filesystems.

Concurrent operations also cross separate catalog/project locks and asynchronous reloads. Existing locks and expected revisions are good foundations; use targeted interleaving tests for simultaneous import, activation, reload, and recovery before claiming cross-process transactional behavior for the entire application.

## 5. What users are likely to want

These are proposed jobs and priorities, inferred from the product purpose and observed friction.

| User situation | Desired outcome | Proposed feature | Validation |
| --- | --- | --- | --- |
| First-time MCP user | “Show me it works” | Setup checklist and client-observed diagnostics | Five moderated first-use sessions |
| Developer using several agents | “Tell me what each project can use” | Availability matrix: MCP scope, native copies, observed runtime state | Have users explain states without a guide |
| Curator with many skills | “Find the right workflow quickly” | Tags, notes, favorites, task examples, useful filtering | Benchmark realistic task searches |
| Developer updating a skill | “Show what changed and let me recover” | Commit diff, explicit update, rollback | Update with an edited native copy in a fixture |
| Developer moving machines | “Restore my collection safely” | Versioned export/import with path rebinding | Restore into a clean test environment |
| Team lead | “Share a reviewed baseline” | Portable project manifest/lockfile, review policy | Validate demand before hosted team features |
| Privacy-conscious user | “Keep local content local” | Local-first defaults, explicit sync, redacted diagnostics | Inspect network traffic and exported data |
| User facing a failure | “Tell me what happened and what survived” | Operation history, actionable errors, recovery status | Test stopped discovery, quota, and disk conflicts |

Prioritize confidence and lifecycle over ratings, social feeds, chat, or automatic agent execution. Stars/installs can support discovery; they do not establish safety or task quality. Avoid recommendations labeled “best for you” until there is evidence supporting them.

Proposed research: recruit five developers spanning new MCP users, multi-agent users, and skill curators. Ask each to enable one skill, prove project isolation, inspect an unknown package, recover from a stopped marketplace, and explain the difference between saved/enabled/native. Record completion, time, wrong turns, and confidence. Treat five sessions as an initial qualitative signal, not a representative market study.

## 6. Path to production

### Choose a release boundary

| Target | Reuse now | Additional requirement |
| --- | --- | --- |
| Personal/local production | Local Express, filesystem library, stdio, recovery | Packaging, diagnostics, backup/restore, supported-platform QA |
| Public portfolio demo | Existing sample-data factory and disabled local writes | Deployed privacy checks, abuse controls, uptime, accurate demo messaging |
| Hosted team product | Domain concepts and retrieval interfaces | User identity, tenant authorization, durable storage, quotas, audit history, migrations, local companion design |

**Recommended sequence:** ship a dependable local app with an isolated public demo. Validate sharing demand before building multi-tenancy. A remote server cannot directly scan or modify a visitor's computer; native operations would still need an authorized local companion or explicit downloaded artifacts.

### Gate A: reproducible local release

**Local access boundary:** prefer stdio for ordinary assistant use. The current optional HTTP MCP has no user/process authentication; any local process that can reach it can request an unscoped read. Origin/Host checks and the separate browser write token do not authenticate local processes. Before broad distribution, implement and document an appropriate separate MCP bearer token or restricted IPC, or explicitly limit the release to the trusted-local-process model. Never expose the owner API through a tunnel. [MCP local-server security guidance](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices#local-mcp-server-compromise).

1. Document supported OS and Node versions; the package declares Node ≥22 while current CI runs Linux on Node 24. Add Node 22/24 and macOS coverage; add Windows only with path/locking/native tests and an explicit support decision.
2. Provide one documented launch/install path, versioned artifacts, meaningful exit codes, graceful shutdown, and port-conflict handling. Keep discovery optional and independently diagnosable.
3. The project-aware stdio diagnostic is implemented. Complete the external-client verification procedure and HTTP access-boundary decision. Never overwrite existing editor configurations without a reviewed merge plan and backup.
4. Implement versioned backup/export and restore rehearsal for `.local`, project settings, and required package data. Keep journal/staging recovery coherent; do not back up a half-applied transaction as a clean state.
5. Unknown-requirements handling and saved/reviewed commit distinction are implemented. Add project rename and a safe lifecycle path for obsolete profiles.

**Exit:** a clean supported machine can install, start, configure a project, retrieve a chosen skill with a real SDK/client, restart, and restore a backup using only the documented steps. No owner data appears in shareable examples or build artifacts.

### Gate B: reliability and operability

Add structured local logs with request/operation IDs, stage duration, error code, and snapshot generation. Default to excluding private paths, skill contents, prompts, credentials, and user source code. Provide deliberate redacted export for support. Separate process liveness, library readiness/recovery, and marketplace dependency status.

Bound memory, scan work, concurrent operations, upstream request fan-out, and total operation time. The discovery provider already has 20-second fetch timeouts and caches, and the client has connection/tool timeouts; extend cancellation through the full user operation rather than only ignoring stale UI responses. Use backoff where safe, with no automatic retry that duplicates a mutation.

**Exit:** published resource budgets and measured startup/search/install behavior for representative catalogs; fault tests preserve unrelated/edited files; operation results remain understandable after reload; backup restoration has been rehearsed.

Candidate budgets to validate, not current performance claims: project selection save p95 under 500 ms without native writes; warm local metadata search p95 under 100 ms at 1000 skills; setup completion within five minutes for an experienced developer. Measure first and adjust the release contract honestly.

### Gate C: accessible, tested user journeys

Add real-browser flows for first use, mixed folder state, filtered bulk scope, stale revision conflict, scan expiry, missing marketplace, native conflict, and partial success. UI harness tests remain useful but do not prove real layout, browser focus, or assistive-technology behavior. Test desktop, narrow editor panel, and phone widths; keyboard-only usage; screen readers; reduced motion; and zoom. Use synthetic libraries and deterministic provider fixtures in CI. Keep a separate opt-in provider smoke test so changing external quotas do not make core CI flaky.

**Exit:** all critical flows have current screenshots and assertions on supported sizes, no unresolved critical accessibility failures, and a documented support/recovery path.

### Gate D: public demo operations

Keep `index.mjs → createDemoApp → demo-library` as a separate entry path. Verify the built/deployed artifact does not contain owner catalogs, inventory, project paths, private package files, or secrets; source separation alone is not an artifact inspection. Test capabilities and rejection of scan/install/shared writes against the deployed preview.

The demo currently has a best-effort in-memory per-instance marketplace throttle. This is not a global distributed quota. Add platform or shared enforcement if abuse/cost exposure requires it. Hosted discovery uses a service bearer token and disallows package-byte downloads; configure secret rotation, server-side-only access, monitoring, and failure messaging. Account for cold caches and provider quotas across multiple instances.

The public demo's browser-only selections do not change its server-side sample MCP scope. Explain this explicitly so users do not assume the demo configured a real assistant. Do not deploy the local unauthenticated owner API as the hosted product.

### Gate E: hosted teams, only after demand

Design authentication and per-tenant authorization for every owner API and MCP retrieval, not just a hidden project ID. Replace local PID/file-lock assumptions with a durable transactional model; store immutable package blobs separately from tenant/project metadata. Make sharing roles, license/provenance retention, updates, audit events, deletion, backups, quotas, and migrations explicit. Choose an authorization flow suitable for remote MCP clients during implementation and verify it against current protocol documentation then.

The current project profile is a curation scope, not a security boundary against an assistant with independent filesystem access. A hosted project ID must never be treated as an authorization credential. Keep any local companion permissioned, loopback-bound, and explicit about filesystem destinations.

## 7. Prioritized delivery plan

Effort is relative and unestimated by team size: S = focused change, M = several connected changes, L = architecture or significant workflow. Priorities reflect this review, not promised delivery dates.

| Order | Work | Priority / effort | Done when |
| --- | --- | --- | --- |
| 1 | First-use checklist and prominent Create project — implemented | P1 / S | Fresh users can reach project setup without help |
| 2 | Unknown requirements and source-revision labels — implemented | P1 / M | Unassessed imports never imply verified compatibility |
| 3 | Connection/dependency diagnostics — local stdio check implemented; dependency/external-client checks remain | P1 / M | UI distinguishes settings copied, server probe, and observed client |
| 4 | Native dry-run preview and per-stage partial results | P1 / M | Exact paths and conflicts shown; saved package survives failed activation |
| 5 | Backup/export/restore and project rename/archive | P1 / M | Clean restore succeeds; native cleanup consequences are explicit |
| 6 | Real-browser/accessibility/OS matrix | P1 / M | Supported critical journeys pass in real browsers |
| 7 | Explicit update/diff/rollback | P1 / L | Reviewed revision upgrades safely and can be restored |
| 8 | Resource budgets, cancellation, fault injection | P1 before wider scale / M–L | Benchmarks and documented recovery guarantees exist |
| 9 | Frontend modules and typed API contracts | P2 / M | Shared behavior and errors have one maintainable definition |
| 10 | Search relevance and curated metadata editing | P2 / M | Task-query evaluation improves without unsupported certainty |
| 11 | Portable team manifests | P2 / M | Another machine can reproduce a selection with path rebinding |
| 12 | Hosted tenant model | Conditional / L | Paying/design-partner demand and a reviewed security model exist |

Suggested milestones: first confidence and setup; then lifecycle and recovery; then measured local release and a verified public demo. Hosted team work follows a product decision rather than being bundled into the MVP polish.

## 8. Success measures

Use local/manual measurement or explicit opt-in telemetry. Do not collect skill text or filesystem paths by default.

- **Activation:** fraction of new users who create a project and complete a verified retrieval. Separate internal probe success from an external client request.
- **Time to first value:** time from first open to the verified retrieval, with setup mode recorded.
- **Selection clarity:** fraction who correctly explain saved, project available, and native copied after one task.
- **Trust:** integrity failures, unsafe overwrite events, unresolved recovery cases, and successful restore rehearsals. Unsafe overwrite acceptance target: zero in release tests.
- **Reliability:** operation success/partial-success/error rates and stage latency, with provider outages separated from local failures.
- **Retention hypothesis:** repeat project use and deliberate reuse of saved workflows. Retrieval alone does not prove the workflow improved coding outcomes.

## 9. Source map

Paths are relative to this report directory. These files ground the implementation claims. Only the corrections listed in Current status are implemented in this pass; remaining roadmap items are proposals.

- [Product purpose](../../PRODUCT.md), [design system](../../DESIGN.md), [architecture](../architecture.md).
- [Local HTTP routes and security](../../src/http/local-http-app.ts), [application orchestration](../../src/application/library-application.ts).
- [Library snapshots, bounds, search, and reads](../../src/library/skill-library.ts), [atomic imports](../../src/library/import-package.ts).
- [Project revisions/scoping](../../src/projects/project-store.ts), [native transactions](../../src/projects/native-transaction.ts), [process locks](../../src/shared/file-lock.ts).
- [Scanner](../../src/local-skills/scanner.ts), [persisted inventory](../../src/local-skills/inventory.ts).
- [Local stdio diagnostic](../../src/mcp/check-project.ts).
- [Marketplace bridge and import validation](../../src/marketplace/client.ts), [read-only MCP tools](../../src/mcp/server.ts), [stdio lifecycle](../../src/stdio.ts).
- [Browser library](../../public/app.js), [marketplace UI](../../public/marketplace.js), [guide](../../public/guide.html).
- [Demo isolation](../../src/demo/http-app.ts), [deployment entry](../../index.mjs), [CI](../../.github/workflows/ci.yml).
- Sibling repository: `skill-marketplace-mcp/src/providers.ts`, `src/server.ts`, `src/auth.ts`, `src/http.ts`, and `src/hosted-http.ts`.
