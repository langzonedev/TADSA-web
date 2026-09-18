# TADSA device demonstration

The shared TADSA workspace interface runs against a device-local IndexedDB adapter. Use fictional information only. No records go to the private TADSA database, another device, an email service, NDIS, a bank or payment processor. There is no staff authentication in this public demonstration.

Projects, clients, people, contacts, coordination, intake details, notes, draft invoices, manually recorded receipts, NDIS approval, dated technician availability and files persist in this browser. Changes and audit events commit together. Stale versions are rejected; retries do not duplicate creation. Browser storage can be cleared or exhausted. Export a backup from the Device demo menu first. Backup restore is not yet exposed.

Existing tadsa-web-v1 localStorage records are copied into IndexedDB on upgrade. The original value remains a recovery copy and is not reimported after later saves. Unreadable data blocks startup instead of being silently erased. Legacy UUID record IDs survive.

Offline operation starts after the first successful online load and service-worker activation. Close all tabs and reopen to activate an update. Cache identity includes every shell file and device adapter. GitHub Pages subpaths are supported. Real iOS/Android installation and operating-system storage eviction are unverified.

## Shared source

Run: node tools/sync-from-main.mjs ../TADSA

JavaScript, CSS and logo come from an explicit allowlist. HTML is transformed to install the device adapter before boot and disclose local storage. SHARED_FILES.json records source revision/content hashes and full shell hash. No private history, scans, real records, credentials, server configuration or operational documents are copied. Re-run sync LAST after any shell edit.

Files support PNG, JPEG, PDF and bounded DOCX, 10 MB each and 20 active per project. DOCX compressed entries require browser DecompressionStream deflate-raw support. Files download without embedded execution. Format validation is not malware scanning.

Device menu deletion requires confirmation. Linked people cannot be deleted. Project deletion removes its device notes, files, invoices and receipts; this does not add deletion to the main application.

## Verification

Run node --test tests/device-qa.test.mjs, node tests/browser-device-qa.mjs and node tests/browser-parity.mjs. Browser scripts accept PLAYWRIGHT_MODULE_PATH and BROWSER_EXECUTABLE_PATH.

Local Edge evidence covers migration retention, injected quota rollback, concurrent stale writers, reload persistence, shared register/client/project/operations/document routes under /TADSA-web/, creation, calendar, PDF upload, SVG rejection, offline persisted records and file downloads. Independent evidence is separated in device-qa scripts. Real-device install/update tests remain outstanding.

See PARITY.md. Production identity/permissions, cross-device sync, official invoices, live payments/email, Access migration and real client use remain outside this demo.
