# Public BYOK release

Jenera is an independent film application. Customers connect their own Higgsfield
API account and pay the provider for generations. Editing and exporting do not
submit generation requests. This release does not include subscriptions, a managed
credit wallet, cloud accounts or team synchronization.

## Included

- Jenera identity, generated transparent mark, wordmark, browser/install icons,
  social preview and brand board.
- Separate Studio, Films and searchable Library experiences.
- Saved projects, alternate cuts, archive/restore, story planning, connected
  generation, reference preparation, native trimming/splitting, sequence review,
  selected-shot MP4 exports and project backups.
- Verified BYOK connections, authenticated encrypted cookies, server-only key
  readers, public-mode rejection of environment-key fallback, request/resource
  limits, response security headers, help/privacy pages and an error boundary.
- Reproducible install, GitHub CI, Node preflight, readiness endpoint and a
  non-root container recipe.

## Hosting acceptance

Before inviting customers, select an HTTPS host/domain and configure the vault
secret. Verify `/api/health`, connect a real API key, upload a reference, explicitly
approve a paid short generation, download/play it, generate a connected second
shot, trim/split, and export/play the assembled film. Confirm a second browser
cannot inherit the first customer's connection or view its local projects.

Local and fixture-provider tests are evidence for the application, not proof of
live hosting capacity or provider-side account isolation. Docker runtime acceptance
requires a working Linux Docker engine. Benchmark a 1080p export at the maximum
length you intend to advertise; the 10-minute bound is a limit, not a measured SLA.

## Operator decisions still needed for commercial launch

The repository does not supply your business identity, support email, domain,
service terms, customer pricing or brand registration. Set those from your actual
business decisions. Keep provider billing and Jenera's product terms distinct.
Review provider commercial use permissions and third-party binary distribution
requirements for your chosen delivery method. Avoid claiming guaranteed seamless
continuity or that Jenera is an official Higgsfield product.

The source license remains MIT. Browser storage keys retain their original names
to preserve existing projects through the rebrand. Existing JSON backups import
alongside the new `.jenera.json` files.
