# Primary-source review: practical skill-library behavior and release priorities

Research date: 27 October 2026. Scope: the audit report, current library source, and sibling marketplace provider source. This is technical/product research, not customer interviews, a security certification, or verification of every host integration. TinyFish was available but its fetch failed; official pages were retrieved using the web fallback. Only primary documentation/specifications and repository code support the findings below.

## 1. Model requirement evidence, not a universal compatibility verdict

The Agent Skills format requires a name and description. Its optional `compatibility` field describes environment needs as text; `allowed-tools` is experimental and support varies by implementation. Neither establishes a canonical cross-host capability taxonomy or proof of a functioning runtime. The format also permits extra metadata and supporting files. [Agent Skills specification](https://agentskills.io/specification).

**Repository observation:** the original marketplace importer saved `requirements: []`; search considered an empty missing-requirements set compatible when capabilities were supplied. Raw optional declarations remained in package frontmatter, but not in the catalog's assessed requirement list. See [library/search](../../src/library/skill-library.ts), [importer](../../src/marketplace/client.ts), and sibling `src/providers.ts`.

**Recommended correction:** distinguish unassessed requirements from an assessed empty list. Preserve author text verbatim and display it as a declaration. Compare curator-listed machine capabilities only when that assessment exists. Keep runtime verification a separate future check; never map `allowed-tools` directly into granted permissions. Test absent assessment, explicit empty assessment, matched requirements, missing requirements, and no supplied capabilities.

## 2. Discovery, availability, retrieval, and use are different states

Agent Skills' integration guide separates startup discovery, metadata disclosure, instruction loading, and supporting-file access. It supports both direct filesystem access and a dedicated retrieval tool. Directory discovery varies by host; `.agents/skills` is an interoperability convention rather than a directory mandated by the package format. The guide recommends deterministic collision handling and bounded scanning. [Agent Skills integration guide](https://agentskills.io/client-implementation/adding-skills-support).

**Recommended correction:** keep the report's progressive retrieval design. Use UI labels that describe evidence: saved package; selected for a project; copied to native destination; retrieved through MCP; workflow application not observed. A server probe can prove retrieval but cannot prove the external model followed instructions. Scanner observations cannot prove host activation. These distinctions are product semantics, not reasons to add an agent execution engine.

## 3. Valid packages can contain host-specific behavior

Claude Code documents standard Agent Skills packages plus extensions including invocation controls, subagent execution, and dynamic context injection. It supports relevant skills automatically and explicit `/skill-name` invocation. Consequently, copying a package to another host does not by itself establish identical interpretation of its extensions. [Claude Code skills documentation](https://code.claude.com/docs/en/skills).

**Recommended correction:** expose declared intended environment and host-specific fields, preserve source, and say when the library has not tested that host. “Installed native files” is supportable from filesystem checks; “works in all coding agents” requires actual host tests. Maintain a small documented host/version matrix using fixture packages with representative extensions. Do not present native copies and MCP retrieval as identical integration modes.

The integration guide separately suggests lenient loading for cosmetic metadata problems, while the format specification defines strict authoring constraints. A curated importer may deliberately choose stricter validation. Label rejections as unsupported by this importer and show the reason; do not imply every other host will reject the same package. Avoid automatic rewriting of upstream instructions. [Integration guide: lenient validation](https://agentskills.io/client-implementation/adding-skills-support#lenient-validation).

## 4. MCP exposes capabilities; it does not prove the model used them

MCP tools are designed for model control, with application-specific interaction patterns allowed. Clients discover tools using `tools/list` and invoke them using `tools/call`. The specification treats tool annotations as untrusted unless the server is trusted, and distinguishes tool execution failures from protocol errors. Structured results are supported alongside content. [MCP tools specification, 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

**Recommended correction:** retain the small four-tool interface and read-only implementations; annotations alone are not enforcement. Diagnostics should identify what they checked and which snapshot/project scope they used. A successful search/get/file test proves that server path. A recorded external call proves a client reached it. Neither should set a status claiming the workflow was successfully applied. Output contracts and focused integration tests are worthwhile before adding more tools.

## 5. Local HTTP still has a trust boundary

Streamable HTTP requires Origin validation when Origin is present, recommends localhost binding for local servers, and recommends proper authentication. A server may respond 405 to a GET when it offers no SSE stream. Stdio communicates with a client-launched process and reserves stdout for protocol messages. The existing stateless JSON-response design is therefore not inherently incomplete merely because GET streaming is unavailable. [MCP transports specification, 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

MCP security guidance specifically recommends stdio to limit local access or restricting local HTTP through an authorization token or restricted IPC. It also treats local process execution/configuration as a security-sensitive boundary. Localhost must not be described as equivalent to authentication. [MCP security best practices](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices#local-mcp-server-compromise).

**Recommended correction:** elevate this from a hosted-only concern to a local release decision. Prefer stdio for ordinary assistant connections. For HTTP, consider a separate MCP access token with a clear client configuration path; the owner browser's anti-CSRF write token is not the same credential. At minimum document that unauthenticated local processes can reach the endpoint and that project IDs are curation scope, not credentials. Avoid exposing the owner API through a tunnel.

## 6. Accessible dialogs are a practical near-term fix

W3C's modal-dialog pattern calls for an accessible label, initial focus inside the dialog, a contained tab sequence, Escape behavior, and focus return to the invoker or a logical next control. A visible title can supply the name via `aria-labelledby`. [W3C ARIA APG: modal dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

**Repository observation:** the original Create project and Connect project dialogs had visible headings without explicit dialog title associations. The native and scan dialogs already used title associations. See [HTML](../../public/index.html).

**Recommended correction:** associate those titles, maintain concise control names, and verify focus after dynamic rerenders. Native `<dialog>` supplies useful behavior but does not remove the need for labels or actual browser/assistive-technology checks. Do not claim accessibility compliance from markup or screenshots alone.

## 7. Recovery and durability require distinct claims

Node 22's filesystem documentation makes flushing explicit: `writeFile` defaults `flush` to false; enabling it calls `filehandle.sync()` after a successful write. It also warns against overlapping writes to the same file without awaiting completion. [Node 22 filesystem API](https://nodejs.org/docs/latest-v22.x/api/fs.html#fspromiseswritefilefile-data-options).

**Recommended correction:** preserve the report's distinction between a logical rename commit point, journal-based process-crash recovery, and power-loss durability. Merely adding `flush` to one file does not establish correct ordering and directory durability for a multi-directory transaction. Test intended guarantees on supported filesystems and document occupied/edited recovery paths. Prioritize recoverable user data and rehearsed export/restore over claiming database-grade filesystem transactions.

## 8. External-provider reliability should use provider guidance

GitHub recommends conditional requests, authenticated requests where appropriate, avoiding excess concurrency, and respecting `Retry-After` or reset headers. It recommends increasing backoff for repeated secondary rate-limit failures rather than continuing to send requests. [GitHub REST API best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api).

**Recommended correction:** keep saved retrieval independent from discovery and preserve honest failure states. Extend caches/backpressure only where needed; do not add automatic repeated package writes. A “refresh” button should not defeat a provider cooldown. Credentials should remain in the backend. Provider metrics describe popularity or ranking, not evidence of package safety or task success.

## 9. Practical production order

The following is an engineering recommendation inferred from the sources and repository, not a standard-mandated roadmap or verified customer demand:

1. Make first-use project creation explicit; clarify saved versus available versus retrieved.
2. Fix unknown requirement assessment and preserve host declarations.
3. Clarify installed versus reviewed commits; give a specific “update unavailable” outcome instead of implying reinstall updated bytes.
4. Add named dialogs and truthful server diagnostics. Avoid a “connected” badge based solely on clipboard or internal probes.
5. Decide/document the local HTTP authentication boundary before broad distribution.
6. Rehearse backup/restore, native conflicts, interrupted operations, and representative resource limits; test supported Node/OS combinations.
7. Add explicit update/diff/rollback, portable project selections, and curator metadata editing after core behavior is trustworthy.
8. Treat hosted teams as a separate product decision requiring identity, tenant authorization, shared transactional storage, quotas, and a local-native integration plan.

Useful acceptance evidence is a reproducible clean-machine setup, actual scoped SDK/client retrieval, preservation of edited native files, clear partial-success results, and successful restore. Source recommendations do not establish universal latency targets or adoption. Retain the report's user-study plan and label its customer needs as hypotheses until observed.
