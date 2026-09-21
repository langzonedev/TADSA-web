# TADSA device demonstration

**[Open the TADSA app →](https://langzonedev.github.io/TADSA-web/)**

Works on phone, tablet and desktop. Open online once before using offline.

The shared TADSA workspace interface runs against a device-local IndexedDB adapter. Use fictional information only. No records go to the private TADSA database, another device, an email service, NDIS, a bank or payment processor. Named demo profiles show who made a change, but do not provide secure staff authentication.

Projects, clients, people, contacts, coordination, intake details, notes, draft invoices, manually recorded receipts, NDIS reference, dated technician availability and files persist in this browser. Changes and audit events commit together. Stale versions are rejected; retries do not duplicate creation. Browser storage can be cleared or exhausted. Use Settings → Backup and restore to create/download backups, import a device backup, preview its contents and explicitly restore it. Replacement retains a before-restore backup atomically. Other tabs must reload afterwards.

Existing tadsa-web-v1 localStorage records are copied into IndexedDB on upgrade. The original value remains a recovery copy and is not reimported after later saves. Unreadable data blocks startup instead of being silently erased. Legacy UUID record IDs survive.

Offline operation starts after the first successful online load and service-worker activation. Use Update ready in the Device demo menu after saving your work, or close all tabs and reopen. Cache identity includes every shell file and device adapter. GitHub Pages subpaths are supported. Real iOS/Android installation and operating-system storage eviction are unverified.

## Guided project workflow — 0.11

Projects now open at **Overview**: one clear next action, case notes for the current call, and the work/client/technician/location context. Open the named task to work beside its assessment, quote or Finance evidence. Saving a workflow task returns to the updated overview. Files, Costs & invoices and Workflow history have readable dedicated views. Workflow history opens directly to saved review comments, decisions and revision reasons; More contains the audit trail, full case-note history and exceptional project actions. Current revision feedback appears as Changes requested on Overview. Assessment drafts survive file uploads and an independently saved note. Invoice preparation, hours and holds have focused screens. The shared main-app interface uses device-local demo data here.

New projects keep one number from assessment through technical work. Versioned quotes, technical peer review, client acceptance and recorded external Finance clearance guide progression. Customer sign-off, the technician's actual cost return and Finance finalisation precede closure. Revisions pause work and require renewed approvals; cancellation preserves costs and history. Existing projects can explicitly adopt this workflow without automatically merging old assessment and technical records.

NDIS is an external client reference, not an internal approval gate. Technician profiles include qualifications, safety training and clearances. Download a printable client quote or a Finance ZIP containing the summary and project files. Email drafts require the operator to select the sender and attach the pack manually; the app sends nothing. All records remain synthetic and device-local.

## Mobile and administration update

Phones use a hamburger menu and grouped project sections. Client, OT and other profile types are separate; only Technician + Administrator can combine. Technician selection filters skills, postcode and service area independently of NDIS. Reports summarise monthly case events and recorded billing, with unknown historical dates disclosed. Invoice drafts use branded multiline layouts and configurable issuer/tax/payment settings. All business/customer records remain fictional demonstration data; no money moves.

## Shared source

Settings contains the default hourly rate for new projects and device appearance preferences (Light, Dark, device setting and reduced motion). Existing projects retain their captured rate. Live search previews and project sections use the same source as the main application. When an update is ready, the Device demo menu offers a reload; finish or save your current work first.

Run: node tools/sync-from-main.mjs ../TADSA

JavaScript, CSS and logo come from an explicit allowlist. HTML is transformed to install the device adapter before boot and disclose local storage. SHARED_FILES.json records source revision/content hashes and full shell hash. No private history, scans, real records, credentials, server configuration or operational documents are copied. Re-run sync LAST after any shell edit.

Files support PNG, JPEG, PDF and bounded DOCX, 10 MB each and 20 active per project. DOCX compressed entries require browser DecompressionStream deflate-raw support. Files download without embedded execution. Format validation is not malware scanning.

Device menu deletion requires confirmation. Linked people cannot be deleted. Project deletion removes its device notes, files, invoices and receipts; this does not add deletion to the main application.

## Verification

Run `node --test tests/*.test.mjs`, `node tests/browser-device-qa.mjs` and `node tests/browser-parity.mjs`. Browser scripts accept PLAYWRIGHT_MODULE_PATH and BROWSER_EXECUTABLE_PATH.

Local Edge evidence covers migration retention, injected quota rollback, concurrent stale writers, reload persistence, shared register/client/project/operations/document routes under /TADSA-web/, creation, calendar, PDF upload, SVG rejection, offline persisted records and file downloads. Independent evidence is separated in device-qa scripts. Real-device install/update tests remain outstanding.

See PARITY.md. Production identity/permissions, cross-device sync, official invoices, live payments/email, Access migration and real client use remain outside this demo.

## Demo profiles

Sign in as `demo-admin` using the demonstration password shared by Greg. The password is no longer prefilled or returned by the status endpoint. Custom demo accounts keep their own passwords. The shared demo login is a convenience gate, not secure hosting: this public application's code and device storage are accessible to the person using that browser. Never enter real personal information or reuse real passwords.

Open **Account** to create named demo accounts and demonstrate restricted technician-detail permissions. Accounts are independent of People profiles. Data, accounts and changes stay on the current device; they are not synchronised with the main application or other devices.

## Client projects

Each issue is a separate project directly linked to its client, with its own number, description and status. Client profiles show a summary of each project. Primary-request grouping is removed from the workflow. Saved projects and older backups upgrade in place; legacy request information is retained internally for recovery compatibility.
