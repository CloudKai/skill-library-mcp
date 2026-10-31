# Skill Library

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers with a personal collection of agent skills. The owner wants to browse source repositories and choose which skills an assistant can access in each project.

## Product Purpose

Discover public skills, curate a shared local library, and keep a focused enabled set for each project. The owner confirmed separate selections per project on 26 October 2026.

## Operating Context

A local browser UI beside a coding assistant. The MCP server already exposes four read-only retrieval tools over stdio or localhost HTTP. The UI adds owner-side project settings, not model-invoked write tools.

## Capabilities and Constraints

- Provide a separate publicly hosted sample-data demo with live marketplace discovery. Never load the real owner library, inventory or paths in that entry point. Cloud demo selections stay in the visitor’s browser; scan/install and real activation require the local app.

- Browse original instructions, supporting files, and GitHub provenance.
- Create project profiles and switch skills on or off independently.
- Group imported multi-skill collections by author in collapsed folders; standalone skills have one switch. A fresh clone starts empty. A folder checkbox applies to every member; expansion reveals per-skill overrides. Mixed selection is explicit, and new imports are not automatically enabled.
- Exclude disabled skills from every project-scoped MCP read, not just the UI.
- Provide a general MCP setup and usage guide with placeholder examples and troubleshooting, without loading saved project names or paths. Highlight the section being read in the sidebar. Keep working project-specific configurations in the library’s Connect project dialog.
- Keep globally unscoped connections backward compatible.
- Stay local, preserve the existing curated packages, and preserve existing user editor settings.
- Keep imported packages and machine-specific project settings in ignored local storage. Use generic placeholders in shared examples.
- Keep project navigation under Library and on-page section links under MCP guide. Marketplace ranking filters belong in the main page, without duplicate sidebar controls.
- Keep navigation compact and let the owner show or hide it with a persistent sidebar icon across all pages. Remember separate wide/narrow preferences; start closed at 960 px and below without blocking project selection.
- Discover skills with authenticated skills.sh search/rankings and topic-filtered GitHub repository stars through a separate local read-only MCP. Provider metrics and freshness stay explicit.
- Present all marketplace rankings and keyword search as repository collections with project descriptions and per-skill summaries; preserve provider ranking semantics and disclose the sampled window.
- Persist observed source locations under All discovered, Global installations and discovered project directories. Show platform identifiers and expandable paths/last-seen times; include unimported and unsupported packages. Keep these read-only source views distinct from project access settings, and retain out-of-scope observations on narrower scans.
- Scan supported global/project skill locations and optional workspace/custom folders locally. Show package sources, duplicates, unsupported content and coverage limits; import complete valid copies without enabling them or changing original installations. Never infer installed skills with AI or treat arbitrary plugin caches as confirmed installations.
- Inspect commit-pinned public GitHub packages, instructions, requirements and setup before installation. Ordinary new imports remain disabled; an explicit action installs and enables for a project.
- Optionally configure project-local Codex, Claude Code and Cursor copies in a validated existing directory. Project and collection switches update MCP availability and unchanged app-managed copies together. Preserve conflicting or edited files; stage changes with rollback and startup recovery.
- Existing projects stay MCP-only until native destinations are explicitly configured. Installation never executes arbitrary repository setup scripts.
- Activation makes instructions available; it does not execute a skill or install a VS Code extension. Already-loaded conversation content cannot be withdrawn.

## Brand Commitments

The user requested a VS Code extension-style installation/activation model. Use familiar project navigation, skill rows, explicit enable/disable controls, and an inspection pane. This is a task-focused app surface, not a marketing page.

## Evidence on Hand

No third-party skill packages are bundled. Owners import their own packages with source metadata and supporting files into ignored storage. The public demo uses original synthetic content, and SDK integration tests generate temporary synthetic fixtures. Do not invent downloads, ratings, reviews, or marketplace statistics.

## Product Principles

- The full library stays accessible to its owner.
- Project scope is explicit and enforced at retrieval time.
- Saved state and connection instructions must be understandable without terminal expertise.
- A disabled skill stays saved and can be enabled elsewhere.
