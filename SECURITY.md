# Security

Jenera defaults to public bring-your-own-key operation. It never falls back to
server Higgsfield credentials unless `JENERA_APP_MODE=private` is explicitly set.
Private mode requires access control supplied by the deployment operator.

Customer connections use AES-256-GCM encrypted, authenticated, expiring cookies.
Set a stable, random `SESSION_ENCRYPTION_KEY` in production. Rotating it invalidates
existing connections; customers reconnect. Credential readers are server-only,
not callable Server Actions. Provider jobs are queried with the customer's own key.

Generation/status/cancellation and film JSON requests have bounded bodies and
same-origin checks. Native processing uses validated CDN URLs, bounded downloads,
limited concurrency, timeouts and isolated temporary files. Process-local request
limits protect one instance; use a shared limiter and trusted edge controls before
scaling to multiple public instances. The media route is a Node workload, not an
Edge Function.

Report vulnerabilities privately through the repository's GitHub Security tab when
private reporting is enabled. Do not include credentials, signed media URLs or
private project files in public issues. If private reporting is unavailable, contact
the repository owner privately before disclosing details. Revoke any exposed key
at the provider immediately.
