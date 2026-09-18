# TADSA web prototype

Public, synthetic, device-local workflow starter. No server/database credentials or real customer records are included.

People support create/read/edit/delete; projects support create/read/edit/delete with client and technician links. Linked people cannot be deleted until project links are removed. Edits persist in this browser using localStorage (not PostgreSQL or cross-device sync). Reset requires confirmation. Use fictional entries only; browser storage is not a secure repository for personal data. Avoid simultaneous editing in multiple tabs.

The manifest and service worker provide an offline application shell after the first online load. Installation availability varies by browser; actual iOS/Android installation has not been verified. Open the Pages URL, then use the browser's Install/Add to Home Screen option where available.

## Shared design boundary

Reused allowlisted files: styles.css, assets/tadsa-logo.png, seed.mjs. Source private TADSA revision686583a. No private history, attachments, business documents or operational configuration were copied. app.js is a small independent device-local adapter/UI, not a full transfer of the backend-dependent private frontend. Changes currently require explicit manual review in both repos; automatic synchronization and full contract parity remain future work. See SHARED_FILES.json for hashes of reused files.

## Verification

Local Edge/Playwright at the /TADSA-web/ subpath passed: person create/edit/delete, reload persistence, project creation, offline reload with preserved project,375px reflow, and zero uncaught browser errors. Project edit/delete paths exist but were not separately exercised in that pass. Real-device install/update tests and independent review remain outstanding.

## Limits

This starter does not yet include private-app assessments/approval enforcement, client detail forms, case notes, invoice generation, funding, merging, authentication or specialist technician matching. It is a public interaction prototype, not production software. The initial implementation plan remains the broader roadmap.

When changing shell files, bump CACHE in sw.js. Existing installations receive updates after the updated service worker activates; device data is kept separately. A controlled import/export feature and IndexedDB adapter remain planned.
