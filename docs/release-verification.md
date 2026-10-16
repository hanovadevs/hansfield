# Release verification

## 2026-10-16 — Guided films, team workspace and spending controls

- 34 unit/native-media tests and 35 browser cases passed across the full and focused runs. Coverage includes
  signed cost approvals, changed-input/replayed-approval rejection, server budget
  enforcement, account isolation, receipt recovery without another submission,
  canceling a film cost review, connected clips, editing and exports.
- Film projects now have explicit rename/delete controls, confirmation and undo.
  Regression checks cover preservation of other projects, deletion after reload,
  safe active-board cleanup and preventing deletion of pending provider jobs.
- The guided film flow was exercised from an empty story through its live clip
  count, two sequential fixture generations with separate approvals, review,
  MP4 export and mobile layout. The removed direction cards are absent. Fixture
  storage transfer is replaced; ending-frame extraction and export run natively.
- SQLite tests close and reopen the database to verify budget/receipt persistence.
  Type checking and the optimized standalone build passed without tracing warnings.
- The production standalone server returned readiness 200 with native tools and
  the journal available. Anonymous usage and generation returned 401 despite a
  configured environment key. Journal data is kept outside the deployment package.
- Real-account price-only checks covered the selectable catalog. Verified
  description contracts are calculated explicitly; Kling Motion Standard/Pro
  estimate endpoints returned upstream 500 responses even with real source media.
  Those paths remain blocked before spending while pricing is unavailable.
- Production browser checks verified live estimates, cost-review cancellation,
  budgets, desktop/mobile layouts and zero page errors or mobile overflow.
  No new generation requests were submitted during these checks.
- An existing real clip was inspected, split, crossfaded and exported into a
  playable 3.703-second 1280×720 H.264/AAC MP4. Evidence remains in ignored
  `artifacts/`, including workspace screenshots and film verification reports.
- The configured provider credential was absent from candidate source files;
  generated environment, SQLite and verification data are excluded from packaging.

The latest pushed commit is checked separately by GitHub's Linux browser/build and
Docker startup jobs. This is application verification, not a live customer-domain
deployment or a guarantee of provider availability, visual continuity or final cost.

## 2026-10-11 — Initial Jenera release

Local Windows / Node 24 verification:

- 29 unit and native-media tests passed, including real FFmpeg decoding,
  dimensions/audio/duration, schema routing, continuity invalidation,
  authenticated cookie encryption/expiry, streamed body bounds and proxy origins.
- 28 browser cases passed across the full run and the focused rerun of a case
  interrupted by a development-server restart. They cover Studio, Films, Library,
  generation recovery/cancel, connected references, editing/review/export,
  project isolation and verified public BYOK customer boundaries.
- Type checking and the optimized production build passed.
- The prepared standalone server starts on Windows after repairing Next's traced
  directory links. Readiness executes FFmpeg/FFprobe and checks temporary storage.
- The production browser accepts its correct localhost origin, rejects a foreign
  origin, and leaves anonymous generation unauthorized despite a server API key.
- An actual provider connection was verified and an existing four-second real
  clip was inspected, split, crossfaded and exported in the production browser.
  The resulting 3.703-second 1280×720 H.264/AAC MP4 played and decoded successfully.
  This check submitted zero new generation requests.
- Production desktop/mobile checks recorded no page errors and no mobile overflow.
- Actual configured provider credentials were absent from candidate source files.
  Standalone packaging removes copied environment files and verification artifacts.

Evidence screenshots, media and provider receipts are kept in ignored local
`artifacts/`; they are not distributed as customer data or committed to GitHub.

GitHub CI runs Linux type/unit/browser/build checks and a separate container
startup/readiness/anonymous-isolation check. See the repository's Actions page
for the status of the specific pushed commit. Local Docker acceptance was unavailable
because the installed Linux Docker engine returned an error. There is no live
customer-domain deployment or hosting capacity acceptance implied by these checks.
