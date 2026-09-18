# Device parity matrix

Shared UI files are byte-identical; index entry is explicitly transformed. Content hashes in SHARED_FILES.json are authoritative. The local adapter is a separate persistence implementation, not production security equivalence.

| Workflow | Local behavior | Boundary |
|---|---|---|
| Registers/search | Shared UI; identities, references, email/phone/address | Fictional/device-only records |
| Create/edit | Clients, people, projects, intake, relationships, versions/retries | No Access import |
| Contacts/coordination | OT/carer replacement, open-project links, advisory skills, payer | No qualification approval |
| Notes/operations | Audit, approval/hold/resume, review queue | Unauthenticated device operator |
| Invoices/payments | Snapshots, contribution limits, receipt caps | Drafts and manually recorded receipts; no money moves |
| NDIS/labour | Client number, project approval, free assessments, technical $50/hour | No NDIS integration; approval/payment gates enforced |
| Calendar | Dated availability, overlap rejection, service areas | Unknown dates are unknown; human assignment |
| Files | PNG/JPEG/PDF/DOCX checks, persistence/download/removal | No malware scanner or cloud store |
| Documents | Shared print/save-PDF | Official template/tax/seller details provisional |
| Authentication | Explicitly unconfigured | No private accounts copied |
| Storage | Atomic IndexedDB, version conflicts, legacy migration | Browser/device only |
| Device tools | Export, reset and protected deletion | No restore UI yet |
| Offline | Scoped cached shell and local file downloads | Real mobile installation/eviction untested |

Future main API changes require adapter contract review and both model/browser suites. Endpoint coverage does not claim every failure path is identical.
