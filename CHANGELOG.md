# Changelog

## Unreleased — Team workspace and spending controls

- Add a persistent forest navigation rail, responsive workspace layout and
  keyboard tool search for Studio, Films, Library, connection and Usage.
- Preview authenticated generation estimates, require input-bound cost approval
  and review film shots individually before paid submission.
- Add per-key request/daily budgets, atomic durable SQLite reservations, a
  searchable request journal and CSV export. Label estimates and older records
  honestly; preserve provider request/correlation identifiers for troubleshooting.
- Replay accepted provider receipts on recovery without another submission.
  Canceling a film cost review restores the shot to its planned state.
- Require Node 22.13+, persist the journal outside deployment output, and include
  storage readiness, data-volume configuration and pricing/budget regression tests.

## 1.0.0 — Jenera public BYOK release preparation

The original studio's unreliable generation and single-board workflow are replaced
with schema-validated model inputs and a dedicated film project experience.

- Rebrand to Jenera with an original generated J ribbon mark and complete app assets.
- Add 35 selectable image/video models and native Cinema Studio controls.
- Validate exact endpoint schemas, preserve submission identity, recover accepted
  jobs, retry transient status errors, and cancel through the provider.
- Add isolated film projects, story plans, continuity references, alternate cuts,
  timeline undo/redo, trim/split/reorder/mute, continuous review and native MP4 export.
- Simplify Studio, Films and Library with responsive ivory/sage styling, focused
  controls, searchable media and project backup/import.
- Default public operation to verified customer-owned API keys. Encrypt credential
  cookies, remove remotely callable credential readers and shared-key fallback,
  bound request bodies/resources and add rate/security headers.
- Add help/privacy, production preflight/readiness, a container recipe, GitHub CI,
  and unit/native/browser regression coverage.

Commercial hosting acceptance and business-specific launch information are separate
from this source release; see `docs/launch.md`.
