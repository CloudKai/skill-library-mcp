# Local-app implementation — 31 October 2026

This is the current implementation record for [the audit](REPORT.md). The 27 October findings remain historical evidence. Screenshot artifacts are excluded from the source repository. Hosted multi-tenancy, customer studies, live-provider qualification and actual coding-host activation are separate release activities; this change does not claim those outcomes.

## Implemented workflows

| Audit area | Result |
| --- | --- |
| First use / connection | Existing setup checklist and real stdio probe retained. Availability is never labeled as workflow execution. |
| Detail hierarchy | Requirements and availability stay visible; notes and provenance use progressive disclosure. Original instructions remain escaped text. |
| Collection scope / undo | Filtered collection changes visibly state their full scope. Undo uses the exact saved project revision and the same native transaction safeguards. |
| Native effects | Preview shows exact add/remove/unchanged paths and conflicts without creating destination folders. Both the library form and marketplace installation require reviewing current inputs; apply rechecks filesystem safety. |
| Project lifecycle | Rename, edit folder label, archive and restore from Library settings. Archiving disables selections and removes unchanged managed copies transactionally. Edited copies block archiving. Restoring leaves skills disabled. |
| Package lifecycle | Edit notes, tags and preferred state; archive and restore saved packages. Archiving requires disabling the skill in every project. Starter metadata changes are explicit private overrides; shared starter files remain untouched. |
| Portable backup | Download a versioned JSON backup of current package bytes and profiles. Checksums, paths, package structure, size limits and revision identities are validated before restore. |
| Restore | Review an expiring plan, then merge missing packages. Different saved bytes are never overwritten. Private starter metadata restores only where no private override exists; differing private metadata is reported as a conflict. Profiles get deterministic new IDs, a restored suffix, empty folder labels and no native bindings; repeat restore is idempotent unless a restored profile was edited. |
| Update review | Fetch the chosen public GitHub commit, show file changes, bounded before/after text previews and full new instructions, then explicitly apply. Plans expire after 15 minutes. A normal reinstall still cannot silently update. |
| Rollback | Restore a retained previous package revision, with up to 20 steps in the private catalog. Enabled managed native copies must be disabled before update/rollback, preventing silent replacement of edited files. Re-enable them explicitly afterward. |
| Refresh | Explicitly reload the HTTP package snapshot, retaining the previous valid snapshot on failure. A sequence guard prevents older concurrent refreshes from replacing newer results. Stdio clients must reconnect for package changes. |
| Local diagnostics | Library status, loaded bytes, generation, redacted recent operation outcomes and explicit discovery reachability check. A health probe does not verify provider credentials, quotas, an external assistant or native activation. |
| Partial success | Installation and restore distinguish saved packages from failed activation/profile stages. Important mutations return an operation ID; their outcome is retained locally. |
| Resource guards | Default 128 MiB retained snapshot bytes, configurable deliberately; 64 MiB portable JSON backups; bounded package/file counts; bounded expiring review plans; four in-flight discovery calls; provider cooldown enforcement. |
| Recovery | Corrupt/oversized/linked journals fail closed; recovery checks destination parents and staging folders. Replacement project files and journals flush before publication. No general power-loss durability claim is made. |
| HTTP access | Optional `SKILL_LIBRARY_HTTP_TOKEN` bearer authentication for MCP. Default HTTP mode remains trusted-local-process mode. Stdio is recommended. Origin/Host checks and owner write tokens remain separate controls. |
| Search | NFKC-normalized Unicode keyword matching; curator notes/tags are editable. No embedding service or AI key was added. |
| Frontend maintenance | Readable marketplace code, installation controller separated into a module, separate settings controller and owner-request helper. No frontend framework migration. |
| Launch / CI | `npm run local` starts the library; `-- --marketplace` also starts the already-built companion. CI defines Node 22/24 on Linux/macOS. Defining the matrix is not evidence that remote CI has passed. |

## Using the local app

```sh
npm ci
npm run local
# Optional: after building/configuring the sibling discovery repository
npm run local -- --marketplace
```

Open the library, then **Library settings**. The discovery process is optional for saved retrieval. `PORT` controls the library; `MARKETPLACE_PORT` controls the companion when using the launcher. The launcher reads each repository's ignored `.env.local` through Node and stops its child services together.

For optional HTTP MCP authentication, set a private, random 64-character lowercase hex `SKILL_LIBRARY_HTTP_TOKEN` before launching. Its value appears only in private connection settings, never in shareable examples or ordinary state. For HTTP format, Show local configuration displays the URL and required headers. This is a local MCP access credential, not multi-user authentication: the owner API still assumes trusted local processes. Do not tunnel the owner app or treat a project ID as authorization.

## Backup and update guarantees

- Backups contain private package contents and profile paths. Keep them local and secure. They intentionally omit source inventory, credentials, local operation history and old update revisions. Use a stopped-server filesystem backup if those additional files are required.
- Package publication is content-addressed and the catalog replacement is atomic. Restoring profiles is a subsequent transaction. If it fails, the API reports partial success with the saved packages retained; review/retry the backup. It does not pretend both stages rolled back.
- A backup is a collection recovery artifact, not a reinstallation of original platform folders. Native destinations always require deliberate rebinding.
- Updates/rollback do not run repository setup. Enabled native copies must first be disabled using their normal switches. The same conflict checks preserve edited or unrelated files.
- Text previews are bounded. When truncated or binary, inspect full files at the pinned source before applying. Attribution and package files remain intact.
- Retained old package directories are not automatically garbage-collected. Avoid deleting immutable package directories referenced by current catalogs/history. This change does not promise a disk-space quota.
- PID locks and rename/journal recovery target cooperating local processes on supported local filesystems. They are not a distributed transaction protocol or a guarantee against every power-loss/filesystem failure.

## Validation and limits

Tests use the agreed owner-HTTP and scoped-MCP boundaries, plus browser checks against a disposable library. New failing behavior was established before implementing native previews, profile lifecycle, portable restore, Unicode search, operation history, corrupt-journal handling, optional HTTP authentication, selection undo and text update previews.

Browser checks cover profile renaming, private backup download, review/apply restore, native preview, reviewed update application, rollback and the maintenance surface. Synthetic discovery fixtures are used for deterministic update checks; no owner native destinations or real editor configuration are modified. Screenshot artifacts are intentionally excluded from the source repository.

[Synthetic benchmark results](PERFORMANCE.md) cover 100/500/1000 tiny packages. They do not establish real-package memory or latency guarantees. Physical coding hosts, screen readers, every supported OS/browser combination, deployed demo artifacts, live providers and power-loss behavior remain unverified here. The hosted-team work remains conditional on a product decision and its own identity/storage design.

The review found and corrected starter-metadata restore loss, metadata edits being blocked by native bindings, rollback confirmation surviving skill changes, and marketplace native installation bypassing preview. Advisory refactoring opportunities remain in duplicated publication/native-state construction and the maintenance module’s breadth. The mechanical design scan ran once: one existing toolbar-divider padding warning and 48 palette/radius/type/modal advisories; browser review retained the incumbent visual system. This is not an accessibility certification.

Final verification on 31 October 2026:

- `npm run check`: passed.
- `npm test`: 81 passed, 0 failed, 0 skipped. The complete suite ran once after review fixes.
- `npm run validate`: passed against the current local catalog (158 skills, 995 files, 20,288,490 loaded bytes); read-only validation.
- Browser: profile edit, portable backup download/restore, desktop/mobile native preview, update/rollback, rollback confirmation reset, and marketplace preview followed by explicit native apply. Marketplace preview created no native destination before apply. All browser mutations used disposable fixtures.
- Standards review: two correctness findings corrected; no confirmed hard documented-standard violations. Three advisory refactoring concerns remain as listed above.
- Spec review: three initial findings and two follow-up concurrency/activation findings corrected. Final focused follow-up found no further consequential defects in those changes.
- Browser verification also caught and corrected the marketplace script’s missing module declaration after its controller split.
- `git diff --check`: passed. Remote CI, real coding hosts and live providers were not exercised by this run.

The interview guide is maintained separately on the owner’s Desktop and is excluded from this repository. Earlier totals in the audit describe the earlier pass.

## Source-only distribution cleanup — 31 October 2026

Bundled third-party starter packages have been removed. The shared catalog is empty on a fresh clone. Existing ignored imports and project files remain local; a profile referencing a removed starter requires importing that skill again before it is available. Tests now generate original synthetic packages in temporary directories, independently of the owner’s library. The CLI walkthrough uses the isolated synthetic demo collection. Screenshot captures and generated build/dependency folders are excluded from the distributed source. Earlier catalog/test counts above are historical results from before this cleanup.

Cleanup verification: `npm run check` passed; `npm test` passed all 82 tests after replacing the remaining starter-specific test URL; `npm run demo` completed retrieval over real stdio using synthetic demo data. Generated `dist/` and `node_modules/` were removed again after verification.
