# MCP setup & usage surface brief

Destination: `.impeccable/briefs/mcp-guide.md`. Development context for `/guide.html`; not served page content.

- **Mode:** Read, with a small configuration task embedded in the article.
- **Reader and job:** A local Skill Library user needs to connect an assistant to the intended project and understand how to request a saved workflow.
- **Direction:** Extend the incumbent workspace system: shared sidebar, neutral canvas, restrained blue controls, system UI text, and monospace configuration. Preserve the existing visual identity.
- **First viewport:** The sidebar contains Back to library and six section anchors. The main area opens with the page title, a plain-language purpose statement, and project selection guidance before the configuration section.
- **Story and task:** Choose project skills → connect the same project → request a workflow. Matt Pocock is a collection with three saved skills and master/individual toggles. Impeccable is one standalone skill with one availability switch for its complete command set.
- **Proof and content:** Server-generated project-specific TOML, JSON and HTTP settings; copy feedback; concrete workflow prompts; four-tool reference; execution responsibilities; troubleshooting disclosures. Library guide links carry the current project ID.
- **Responsive behavior:** Sidebar anchors become a two-column top navigation on mobile; configuration selectors stack; code wraps; the tool table scrolls horizontally.
- **Reviewed evidence:** `outputs/skill-collections-panel.png`, `outputs/mcp-guide-desktop.png`, and the shipped public source. Finish review disposition: ship, including the project-context link correction.
- **Unresolved decisions:** None for this extension. Future identity or token changes require their own scope.
