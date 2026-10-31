# Source architecture

Source is grouped by feature. Stateful behavior belongs to classes; parsing and other stateless operations remain functions. Dependencies use explicit file imports rather than barrel files or a dependency injection framework.

```text
src/
  application/
    library-application.ts  # Coordinates scans, imports, installs and snapshot refreshes
    operation-store.ts      # Bounded redacted local operation outcomes
  library/
    skill-library.ts       # Validated package snapshots, search and retrieval
    import-package.ts      # Atomic package publication and catalog updates
    maintenance.ts         # Reviewed backups, updates, rollback and curator metadata
  projects/
    project-store.ts       # Project persistence, revisions and scoped access
    native-transaction.ts  # Staged native installs, rollback and crash recovery
  local-skills/
    scanner.ts             # Bounded discovery, scan snapshots and reviewed imports
    inventory.ts           # Persistent source observations and grouped inventory
  marketplace/
    client.ts              # Discovery MCP client and pinned package validation
  mcp/
    server.ts              # Read-only tool schemas, dispatch and server creation
  http/
    local-http-app.ts      # Local Express routes, security and HTTP error mapping
  demo/
    http-app.ts            # Isolated hosted demo using synthetic data
    data.ts                # Synthetic projects and inventory
  shared/
    file-lock.ts           # Atomic process locks shared by filesystem writers
    atomic-write.ts        # Flushed temporary-file replacement
    safe-directory.ts      # Ordinary directory creation below canonical root
    hash.ts                # SHA-256 digests
    library-error.ts       # Typed application errors
    paths.ts               # Module-relative resource and executable paths
    version.ts             # Package version
  cli.ts                   # Browse and validate command
  demo.ts                  # Example MCP client
  http.ts                  # Local HTTP composition and process startup
  import.ts                # Import command
  scan-local.ts            # Local scan command
  stdio.ts                 # Stdio process startup
```

`LibraryApplication` owns the current `SkillLibrary` and `ProjectStore`. It accepts a marketplace client and scanner, coordinates operations across these modules, and replaces the library snapshot and project store together after imports. Marketplace activation failures retain the saved package and return a partial result. HTTP status selection stays in `LocalHttpApp`.

`LocalHttpApp` receives the application object. It registers routes in security-sensitive order: origin checks and response headers, owner write-token checks, bounded JSON parsing, owner routes, MCP authentication/transport, static files, and error handling. MCP requests read the current application state, so project selections and imported skills remain visible without restarting the local HTTP app.

Existing classes retain focused responsibilities: `SkillLibrary` handles immutable retrieval snapshots, `ProjectStore` handles project changes, `NativeTransaction` handles recoverable filesystem changes, `LocalSkillScanner` owns expiring scan plans, `LocalInventory` persists observations, and `MarketplaceClient` talks to discovery MCP. Composition connects these classes; inheritance adds no useful relationship here.

The root executable files deliberately keep their names. Existing npm commands and external configurations pointing to `dist/stdio.js` or `dist/http.js` continue to work. Other compiled modules follow the feature folders. `index.mjs` loads the isolated demo factory from `dist/demo/http-app.js`.

Resource paths resolve relative to modules rather than the working directory. Shared helpers do not import feature implementations. The hosted demo constructs its own synthetic library and never creates the local application object.

Run `npm run check` and `npm test` to verify types, package integrity, native recovery, scanning, the demo and both MCP transports. Integration tests bind only to localhost and use temporary fixtures.
