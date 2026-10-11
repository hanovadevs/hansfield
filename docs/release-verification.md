# Release verification — 2026-10-11

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
