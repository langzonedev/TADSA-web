# Synthetic operator workflows

September 2026 Phase 1 operator gauntlet. These are implemented prototype journeys and provisional rules, not customer-approved production procedures. Use fictional information only. This PWA keeps records on the current device; its demo accounts do not provide production authentication or server synchronisation.

## Use-case inventory

| IDs | Operator goal | Normal path / exception |
|---|---|---|
| UC01–03 | Access the workspace | Demo sign-in; administrator creates/coordinator uses account; disabled login refused; expired-session draft recovery. First local administrator setup and forced temporary-password change belong to the database application. |
| UC04–08 | Identify and connect people | Search/filter; create client or person; review duplicates; edit roles; link new/existing OT to client; edit organisation contacts. Account permissions and person roles remain separate. |
| UC09–10 | Find a suitable technical member | Review profile, recorded capabilities/coverage and permitted qualifications; compare week/month/year calendars; save/edit/remove availability. Records do not certify suitability. |
| UC11–13 | Capture an enquiry | Choose/create client; record need; allocate known team/payer or leave unknown; review; create one project; add call notes and follow-up. |
| UC14–16 | Assess and agree the work | Assessment decision/findings; quote revision; technical review; corrections/reassessment; record quote sent and client acceptance of the reviewed revision. |
| UC17–18 | Authorise and carry out work | Record external Finance evidence; progress/hours; hold or client stop; recorded consent and authorised resume. Saving a record sends no email or payment. |
| UC19–21 | Complete or handle exceptions | Final delivery; customer sign-off; actual costs; Finance finalisation; close; optional feedback. Reopen/cancel with reason and retained history. |
| UC22–23 | Keep supporting evidence | Upload/download/remove fictional files; preview printable documents; create classified draft invoice; add references and receipt evidence. Official accounting remains separate. |
| UC24–25 | Answer reporting questions | Build/filter/select columns; save/reselect/delete report definitions; export results; select monthly overview; inspect definitions and contributing records; return to selected month/view. |
| UC26–27 | Configure and recover | Appearance; default labour rate; invoice issuer snapshot settings; create/export/import device backup; preview; explicitly restore with recovery copy. Native PostgreSQL archives are a different format. |
| UC28 | Work on a narrow screen or keyboard | Compact navigation; project section picker; labelled forms; keyboard search; calendar keyboard navigation and contained timeline scrolling. |

## UML activity model: enquiry to completion

```mermaid
stateDiagram-v2
  [*] --> FindClient
  FindClient --> CreateClient: No matching record
  CreateClient --> NewProject
  FindClient --> NewProject: Confirm existing client
  NewProject --> AssessmentDecision
  AssessmentDecision --> Assessment: Required
  AssessmentDecision --> Quote: Not required, reason recorded
  Assessment --> Quote
  Quote --> TechnicalReview
  TechnicalReview --> Quote: Revision requested
  TechnicalReview --> ClientAcceptance: Approved
  ClientAcceptance --> Assessment: Reassessment required
  ClientAcceptance --> Quote: Scope or cost changes
  ClientAcceptance --> FinanceClearance: Accepted
  FinanceClearance --> Work
  Work --> Hold: Stop or pause
  Hold --> Work: Authorised release and required consent
  Work --> CustomerSignoff: Complete and delivery recorded
  CustomerSignoff --> ActualCosts
  ActualCosts --> FinanceFinalisation
  FinanceFinalisation --> Closed
  Closed --> Feedback: Optional follow-up
  Closed --> Work: Reopen with reason
```

Cancellation is a separate reasoned branch that retains evidence and requires the applicable cost/Finance finalisation before closing. Returning to an earlier approval step invalidates affected later approvals while retaining history. The diagram is a journey overview; it does not bypass actual validation.

## UML activity model: reporting and recovery

```mermaid
flowchart TD
  A[Choose report source or monthly overview] --> B[Set criteria or month]
  B --> C[Inspect results and definitions]
  C --> D[Open contributing record]
  D --> C
  C --> E[Export or print]
  F[Create or import device backup] --> G[Preview backup]
  G --> H{Explicitly replace workspace?}
  H -->|No| I[Current data unchanged]
  H -->|Yes| J[Keep recovery copy and restore]
  J --> K[Sign in and verify restored records]
```

## What this cycle checks

Independent scripted browser operators exercised people/accounts/OT links, calendars, full project lifecycle, reports, invoices, files and recovery in isolated synthetic stores, with matching database-app checks. CUA browser journeys and isolated Playwright UI journeys are recorded separately in the development evidence. This is not a human customer usability study, physical-device certification or production security acceptance.

Corrections include accurate client-owned project counts in the database app, client-as-payer overview, hold-aware next action, clearer resume instructions, retained report selection, safe draft-conflict review, sign-in-and-keep-draft recovery, Adelaide receipt dates, readable restore counts and contextual save labels. A changed workflow still prevents automatic draft reconciliation; saving again remains an explicit action.

The exception pass also corrected zero-versus-unknown bike cancellations and Adelaide opening/quote dates. Zero cancelled bikes is valid explicit evidence; blank remains unknown, and delivered bike quantity still must be positive. Opening dates use recorded creation evidence when present, preserving stored historical dates otherwise.

Customer confirmation remains necessary for Finance/deposit authority, reporting formulas and GST, partial bike deliveries, historical active-member counts, revision limits, closure/feedback requirements and post-delivery rectification. Missing historical facts are shown as unknown, not reconstructed from guesses.
