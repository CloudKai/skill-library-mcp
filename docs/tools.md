# Implemented MCP tools

All four tools are read-only, use strict JSON input schemas, return `structuredContent` and a JSON text fallback, and operate on the startup catalog snapshot. Arrays and text inputs are bounded. Unknown argument fields are rejected. No tool writes files, executes a skill, installs tools, or calls an LLM.

## Project scope

Bind stdio with `SKILL_LIBRARY_PROJECT=<id>`, or use HTTP `/mcp?project=<id>`. Only that project's enabled skills are available to all four tools. A disabled skill returns `SKILL_NOT_FOUND` even if its ID or file path is known. An empty profile returns an empty list and no search matches. A missing profile fails closed with `PROJECT_NOT_FOUND`; malformed/unreadable settings return an error, not the full catalog. The scope cannot be changed through tool arguments.

The separate browser UI can browse the owner's full catalog and write project selections. Those writes are not exposed as MCP tools. Selections are reread for each tool call; package contents remain the startup snapshot. Unscoped connections preserve full-library behavior.

## `search_skills`

Find a skill using its name, description, tags, and curator notes.

| Input | Required | Default / bounds |
| --- | --- | --- |
| `query` — string | Yes | Trimmed, 1–500 characters |
| `tags` — string array | No | All supplied tags must match; max 30 |
| `capabilities` — string array | No | Available capability names; max 50 |
| `limit` — integer | No | 5; 1–20 |

```json
{"query":"debugging","capabilities":["shell","filesystem"],"limit":3}
```

Output: `{matches, total_matches, compatibility_note}`. Each match has `skill_id`, `revision`, `name`, `description`, `folder`, `standalone`, `tags`, `preferred`, `status`, `requirements`, `match_reasons`, `compatibility`, and `missing_requirements`.

Exact-name matches receive a priority bonus. Otherwise weighted keyword matches determine order, then preference and stable ID break ties. Stop words do not contribute. No match returns an empty array. Compatibility is `unknown` when capabilities are omitted, `missing_requirements` when curator-listed requirements are absent, and `compatible` when those listed requirements are covered. It is not runtime or credential verification.

Errors: `INVALID_INPUT` for invalid arguments; unexpected internal failures use `INTERNAL_ERROR` without exposing filesystem paths.

## `list_skills`

Browse active collection metadata without loading instructions.

| Input | Required | Default / bounds |
| --- | --- | --- |
| `tags` — string array | No | All supplied tags must match; max 30 |
| `preferred_only` — boolean | No | false |
| `limit` — integer | No | 20; 1–50 |
| `cursor` — string | No | Opaque cursor returned by prior page; max 2048 chars |

```json
{"preferred_only":true,"limit":1}
```

Output: `{skills, next_cursor, catalog_revision}`. A summary contains `skill_id`, `revision`, `name`, `description`, `folder`, `standalone`, `tags`, `preferred`, `status`, and `requirements`. No file content is included. `next_cursor` is null on the final page. Keep filters unchanged between pages; order is stable skill ID order.

Errors: `INVALID_INPUT`, `CURSOR_EXPIRED` for malformed cursors or a different catalog/filter snapshot. Restart with no cursor after that error. Archived skills are excluded; this MVP does not implement historical owner reads or `include_archived`.

## `get_skill`

Retrieve one skill's original `SKILL.md` plus its full supporting-file inventory.

| Input | Required | Default / bounds |
| --- | --- | --- |
| `skill_id` — string | Yes | 1–128 chars; use ID returned by search/list |
| `revision` — string | No | Current startup snapshot; max 128 chars |

```json
{"skill_id":"mattpocock/diagnosing-bugs"}
```

Output includes the summary fields plus `skill_uri`, `frontmatter`, `instructions`, `manifest`, `source`, `personal_notes`, and `activation_note`. Original frontmatter is preserved. Manifest entries contain `path`, `uri`, `sha256`, `size_bytes`, and `mime_type`. Source metadata records the upstream repository path/commit for bundled skills.

Use the returned `revision` in follow-up reads. Retrieved content does not override the host's own instructions or permissions. The host decides whether it can follow the workflow and whether any action needs user consent.

Errors: `INVALID_INPUT`, `SKILL_NOT_FOUND`, `ARCHIVED_SKILL`, `REVISION_NOT_FOUND`. Only the current revision in this process is available.

## `read_skill_file`

Read one supporting file from the exact snapshot selected above.

| Input | Required | Bounds |
| --- | --- | --- |
| `skill_id` — string | Yes | 1–128 chars |
| `revision` — string | Yes | 1–128 chars |
| `path` — string | Yes | Relative manifest path, 1–1024 chars |

Example: copy the actual revision from `get_skill` before calling:

```json
{"skill_id":"mattpocock/diagnosing-bugs","revision":"<revision-from-get_skill>","path":"scripts/hitl-loop.template.sh"}
```

Output: `{skill_id, revision, path, uri, mime_type, size_bytes, sha256, encoding, content}`. Text returns `encoding: "utf-8"`; binary bytes return `encoding: "base64"`. The file checksum is checked before return. A shell script is returned as content, never executed.

Errors: `INVALID_INPUT`, `INVALID_PATH`, `SKILL_NOT_FOUND`, `ARCHIVED_SKILL`, `REVISION_NOT_FOUND`, `FILE_NOT_FOUND`, `CONTENT_INTEGRITY_ERROR`. Absolute paths, `..`, backslashes, and unmanifested files are rejected. Package size/type/symlink errors are caught at startup/import, not deferred to the first read.

## Error envelope

Application failures return `isError: true` and both structured and text versions of:

```json
{"error":{"code":"REVISION_NOT_FOUND","message":"This server snapshot does not contain that revision. Retrieve the current skill again.","retryable":false}}
```

The SDK may reject malformed tool arguments before reaching the application handler; those errors also arrive as tool errors but use the SDK's validation message rather than this custom structured envelope. Unknown tool names and malformed protocol requests follow the SDK's MCP/JSON-RPC behavior.

## Typical client sequence

1. `search_skills` for the user's task.
2. Inspect requirements and matching reasons.
3. `get_skill` for a chosen ID; retain its returned revision.
4. `read_skill_file` for supporting files only when needed.
5. The host performs the task using its own available tools.

These are application-defined tools, not the native `skills/list` and `skills/get` protocol extension. Native remote skill activation is not advertised by this server.
