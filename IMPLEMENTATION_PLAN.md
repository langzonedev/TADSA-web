# Public prototype implementation plan

Operator direction, 2026-09-18: this repository will host the public customer-facing TADSA workflow prototype. The private TADSA repository retains PostgreSQL, Access discovery and migration work. This authorises this separate synthetic public prototype; it does not authorise publishing private repository history or customer source material.

## Intended architecture

- Static installable PWA hosted at the GitHub Pages project path `/TADSA-web/`, using relative asset paths and hash navigation.
- Synthetic records persisted in IndexedDB on each device/browser. Create, read, update and delete demonstration records; preserve relationship integrity and confirm destructive actions.
- No real records, credentials, private attachments, live integrations or server database connections. Public interface clearly labels demonstration data and device-local storage.
- Changes remain on that device. No cross-device sync is implied. Storage can be cleared by the browser; provide deliberate reset-to-demo and synthetic export/import controls.
- Service worker caches the application shell for offline use after an initial online load. It must not replace the local data store or reset user edits during an update.

## Preventing drift

Reuse reviewed UI components, branding and interaction contracts from the private application through an explicit allowlisted transfer. Do not mirror the private repository or its Git history. Keep a source revision and hash manifest for the approved shared files. Separate the PostgreSQL/API adapter from the browser IndexedDB adapter, and test equivalent record/workflow operations against a synthetic contract fixture. Document deliberate differences, particularly authentication, email, invoicing and local-only storage.

## Delivery gates

1. Inspect and allowlist frontend files; exclude all source attachments, private docs, database exports and operational configuration.
2. Introduce a shared repository/data-access interface before transferring screens; current private screens assume a backend API and cannot be published unchanged.
3. Implement IndexedDB persistence and relationship-aware CRUD, including interrupted/failed-write behaviour.
4. Exercise the actual workflows at desktop, tablet and phone widths, reload persistence, offline operation, local reset, update behaviour and the `/TADSA-web/` base path.
5. Add manifest, install icons and service worker, then configure GitHub Pages and verify its deployed URL and HTTPS behaviour.
6. Independent review of public contents and browser results before publication.

## Current status

Repository inspected: initial README only. GitHub Pages site query returned404. No runnable PWA, local database adapter, shared-file transfer or Pages deployment has been completed. Work stopped at the operator's reserved remaining usage allowance; no credits or reset credits were used. This plan is not evidence of implemented features.
