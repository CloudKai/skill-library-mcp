---
name: Skill Library
description: A local project-scoped agent skill manager.
colors:
  canvas: "#f6f7f9"
  panel: "#fff"
  nav: "#eef0f4"
  ink: "#1e2938"
  muted: "#596779"
  line: "#dce2e9"
  accent: "#294fbd"
  accent-soft: "#e8eefc"
  green: "#21714b"
  green-soft: "#edf7f0"
  danger: "#a52d35"
typography:
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "28px"
    fontWeight: 630
    letterSpacing: "-0.03em"
  title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "19px"
    fontWeight: 630
    letterSpacing: "-0.02em"
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "14px"
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "12px"
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "12px"
    lineHeight: 1.8
rounded:
  control: "6px"
  tag: "4px"
  emblem: "8px"
  browser: "9px"
  dialog: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  shell-bar:
    backgroundColor: "{colors.canvas}"
    height: "64px"
    padding: "10px 16px"
  sidebar-toggle:
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    width: "44px"
    height: "44px"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.panel}"
    rounded: "{rounded.control}"
    padding: "9px 13px"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "9px 13px"
  search-input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "40px"
    padding: "9px 60px 9px 38px"
  project-navigation:
    rounded: "{rounded.control}"
    padding: "10px"
  tag:
    rounded: "{rounded.tag}"
    padding: "3px 6px"
  skill-switch:
    backgroundColor: "{colors.accent}"
    rounded: "12px"
    width: "32px"
    height: "19px"
  skill-row:
    padding: "21px 20px"
---

# Design System: Skill Library

## Overview

An Operate surface: project navigation, searchable skill rows, and an inspection pane, following the user's editor-extension-manager reference. Code-first implementation; no new marketing identity or imagery.

**Key Characteristics:**
- Neutral light editor shell.
- Compact project navigation and skill inspection.
- Explicit per-project enable/disable state.

## Colors

The palette uses cool neutral layers, a blue action accent, green saved/enabled feedback, and red failures. Frontmatter values follow the CSS custom properties.

### Primary
- **Action blue** (`accent`, `accent-soft`): actions, selected filters, enabled switches, focus, and soft selection surfaces.

### Neutral
- **Canvas, panel, navigation** (`canvas`, `panel`, `nav`): separate the workspace, list, and project sidebar.
- **Ink and muted text** (`ink`, `muted`): primary labels and secondary descriptions.
- **Divider** (`line`): panel boundaries and row rules.
- **Enabled green** (`green`, `green-soft`): status feedback; the soft token is defined for enabled feedback but is not currently applied by a selector.
- **Failure red** (`danger`): error copy and form feedback.

## Typography

System UI typography is intentional for familiar native-like controls. Monospace is reserved for code, file paths, and revisions. The page heading uses the headline role, the detail heading uses title, and compact metadata uses label. Body descriptions locally use 12–13 px with 1.6–1.75 line height; the base body role is 14 px. No display type role is needed.

## Layout

The library, Marketplace, and guide share a full-width sticky shell bar. The brand home link and persistent sidebar icon live in this bar, outside the hideable navigation. The shell bar height is also the sidebar's sticky top offset; the sidebar scrolls within the remaining viewport height. Hiding the sidebar removes its grid column and gives the workspace the full width.

Expanded desktop navigation retains a 224 px sidebar alongside a flexible skill list with a 300 px minimum and a 366 px detail pane. The workspace uses 37 px top, 34 px horizontal, and 28 px bottom padding. At 1500 px and wider, horizontal workspace padding becomes 48 px and detail width becomes 410 px. At 1150 px and narrower, the expanded sidebar is 190 px and detail is 310 px. At 960 px and narrower, the expanded sidebar is 180 px and list/detail stack. Navigation starts closed in this range unless a narrow-screen preference was saved. At 620 px and narrower, expanded navigation appears inline below the shell bar, with a viewport-bounded scroll area; explicitly opening it resets its own scroll position and brings it into view below the bar; workspace padding is 18 px 15 px 24 px. This is an inline disclosure with no modal backdrop or focus trap.

The library's compact project selector is visible whenever the sidebar is hidden and at 960 px and narrower, even with navigation expanded. Guide examples keep a format selector in the article and never load owner project data. Guide anchors, library skill details, and the Marketplace detail pane account for the sticky shell bar when scrolling. Dialogs fit within the viewport. The observed spacing rhythm is recorded in frontmatter; local component spacing also includes 20 px.

The read-only source inventory uses the same workspace shell with a single full-width bordered panel. Its source selector, search field, and scan action wrap within a toolbar; the selector remains available in the main panel, and the compact Workspace selector includes source views when the sidebar is hidden. Inventory rows and toolbar use 20 px padding, reduced to 16 px at 620 px and narrower, where row headings also wrap. Source paths wrap rather than widening the panel.

## Elevation & Depth

The main shell is flat, separated by tonal layers and one-pixel rules. Modal dialogs use `0 18px 60px #1e293829` and a `#1e293858` backdrop; toast feedback uses `0 6px 20px #1e29381a`. These are functional overlays, not decorative panel depth.

## Shapes

Controls have compact rounded corners; tags are smaller, the browser container is gently rounded, and dialogs have the largest container corners. Switches use a pill track and circular thumb. Primary and secondary buttons are at least 38 px high, text inputs 40 px; ordinary icon buttons are 32 px, the persistent sidebar toggle is 44 px square, and the compact switch track is 32 by 19 px.

## Components

Skill rows pair descriptions and tags with explicit status controls; the selected row uses a pale blue fill. Project navigation uses a muted selected fill. Search and segmented text filters sit above the list. The detail pane provides source links and file inspection. Saved project selections drive server filtering. Controls show saving, failure, loading, and empty states. Focus uses a two-pixel accent outline with three-pixel offset. Detail entrance uses a 160 ms ease-out opacity/translation animation; the switch thumb moves in 150 ms ease-out. Reduced-motion preference disables animation and transition.

Shared navigation uses a sidebar-shaped icon with a persistent visible control in the shell bar. Its expanded state uses the soft action-blue surface and accent foreground; hover uses the same treatment. The button has an accessible Show sidebar / Hide sidebar name, `aria-controls`, and synchronized `aria-expanded`. The hidden sidebar is removed from display and keyboard navigation. Closing while focus is in the sidebar returns focus to the toggle. Escape closes navigation when focus is in the sidebar or on the toggle, without intercepting an open dialog. Separate wide and narrow preferences persist in local storage and are shared across the three pages; crossing 960 px loads the matching preference, defaulting open above the breakpoint and closed at or below it. Shared sidebar navigation rows have a minimum height of 44 px. Project navigation sits immediately below Library, and on-page section links sit below MCP guide. These secondary groups use a 12 px left inset and compact muted labels. Marketplace ranking filters stay in the main content and are not repeated in the sidebar. The local-workspace footer stays compact.

Collection folders are collapsed by default; standalone skills use a regular skill row with one switch for the whole skill and its commands. Each folder uses a disclosure button, a 23 px folder icon, a count summary, and a 24 px square checkbox. Partial selection uses a minus with `aria-checked="mixed"`; full selection uses a check. Child rows are indented to 44 px on desktop and 28 px on mobile. The folder checkbox applies to all members, even when the list is filtered. Search expands matching folders, and collapse/expansion is independent of activation. A collection’s expanded child rows retain their individual switches.

Documentation articles reuse the workspace shell and sidebar. The article has a bounded reading measure (80ch), generous line spacing (1.8), and section headings. Short primary navigation labels lead to the library, Marketplace, and MCP guide; a native, initially open “On this page” disclosure directly below MCP guide contains the guide anchor links. Configuration examples sit in bordered white containers with a format selector, a wrapped monospace block, copy action, and inline feedback. The general guide uses placeholder paths and a placeholder project ID only, with no project selector or owner-state requests. Its sidebar marks the section at the reading line below the sticky header using aria-current="location", soft action-blue fill, accent text and weight 600. Tracking follows scrolling, resizing and anchor navigation; desktop/tablet navigation scrolls within its own container to reveal the current link, without moving the article or keyboard focus. Hidden, collapsed or inline mobile navigation does not auto-scroll. The separate library connection dialog defaults to placeholders and retains an unchecked “Show local configuration (contains private paths)” checkbox for explicitly revealing local values; its label has a 44 px minimum height and an 18 px accent-colored checkbox. Copy actions report whether an example or local configuration was copied. Opening the connection dialog resets the checkbox. Tool references use a horizontally scrollable table; troubleshooting uses native disclosure rows. At the mobile breakpoint, the sidebar follows the shared inline disclosure behavior and configuration fields stack.


The local scanner extends the existing native dialog rather than replacing the library workspace. Its secondary header action opens a viewport-bounded modal up to 850 px wide, retaining the incumbent dialog border, radius, padding, shadow, and backdrop. Scope and registered-project selectors share a two-column grid with a 16 px gap; platform choices wrap as native checkboxes. Additional workspace/custom folders and optional cached packages sit inside a disclosure. At 620 px and narrower, scope fields stack and header actions use the full width.

Scanner results remain flat, divided rows: a selection checkbox, skill title, muted status and description, then a source disclosure with wrapped monospace locations. Row labels have a 44 px minimum height, checkboxes are 18 px square, and rows use 16 px vertical padding. Sources and the separate coverage disclosure make duplicate origins, unverified installations, unsupported items, and incomplete coverage inspectable before import. Scanning preselects new valid rows; cached rows require deliberate selection. Import is unavailable until a selection exists. Scan/import progress and failures use inline status or alert text; imported packages stay disabled until explicitly enabled for a project. The results heading receives focus after scanning, while import temporarily locks the dialog controls and prevents closing.

“Found on this computer” is one navigation entry. Global installations, project directories and custom source groups are selected inside the discovered-skills view, rather than repeated in the sidebar or mobile workspace selector. The hosted demo has one project named Example and a single sample discovery view; its mobile selector contains only Example and Found on this computer. These source views remain distinct from Project access profiles. A selected source view persists across reloads; choosing a project returns to its activation view.

Source inventory rows retain the flat, divided list language: a skill name, muted platform/scope summary, compact import-status tag, description, and expandable Source locations. Location details use wrapped monospace paths with platform, scope, optional plugin identifier, unverified-installation feedback, and last-seen time. The same provenance disclosure appears in saved-skill details, while saved rows add a compact platform/scope source tag. View saved skill returns to the library; Scan to review & import opens the scanner for eligible observations. Inventory inspection has no activation switches. Latest-scan coverage and per-location last-seen times remain separately visible because narrower scans retain earlier observations.

<!-- Evidence: this scoped update is grounded in source inspection of the shared stylesheet, three page implementations, and source-inventory rendering helpers. Browser captures were unavailable; rendered layout was not verified. -->

## Do's and Don'ts

### Do:
- Use explicit project scope and saved-state feedback.
- Keep familiar system UI typography and a compact list/detail hierarchy.
- Use visible focus outlines and accessible names for switches, dialogs, and file controls.

### Don't:
- Do not invent marketplace statistics, ratings, or downloads.
- Do not show a saved enabled state before the server saves.
- Do not introduce marketing typography, imagery, or decorative panel shadows.
