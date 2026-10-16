# Deploy Jenera

The supported release architecture is one long-lived Node instance behind HTTPS.
FFmpeg needs executable binaries, writable temporary storage and enough CPU/memory.
Do not put the film route on an Edge runtime. Start with two vCPUs, 4 GB RAM and
at least 2 GB temporary space, then measure actual 1080p exports before setting
customer capacity. Media processes are bounded to two concurrent operations.

## Required configuration

| Variable                 | Public value                                                                 |
| ------------------------ | ---------------------------------------------------------------------------- |
| `JENERA_APP_MODE`        | `byok` (also the default)                                                    |
| `NEXT_PUBLIC_SITE_URL`   | Your HTTPS origin, without a path; set before build and at runtime           |
| `SESSION_ENCRYPTION_KEY` | Stable, random 64-character hex secret; same on every instance               |
| `HF_API_BASE_URL`        | `https://api.higgsfield.ai`                                                  |
| `HF_API_KEY`             | Leave unset; public mode ignores it                                          |
| `JENERA_DATA_DIR`        | Persistent writable local directory; default `./data`, container `/app/data` |

Generate the vault secret locally and save it in your hosting secret manager:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Never commit the generated value. Rotating it invalidates saved customer
connections. Customers reconnect; local projects are unaffected. Disable
`HANSFIELD_TEST_MODE` in production. Keep paid smoke tests opt-in.

## Node deployment

Install the pinned package manager and dependencies, then build:

```sh
npm install --global pnpm@12.5.1
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

Use Node 22.13 or newer for the built-in SQLite journal. `pnpm start` validates the public origin, vault secret, native binaries,
temporary storage and persistent data directory before starting Next. Termination signals reach the server.
Set `PORT` if needed. `FFMPEG_PATH` and `FFPROBE_PATH` can select installed binaries.
Use the same operating system/architecture for installation and runtime.

## Container deployment

Use the included multi-stage, non-root Dockerfile. It builds the Next standalone
server and includes the native tools traced by the media and readiness routes.
The site origin is a build argument because metadata is produced during build.

```sh
docker build --build-arg NEXT_PUBLIC_SITE_URL=https://studio.example.com -t jenera:1.0.0 .
docker run --rm -p 3000:3000 --mount source=jenera-data,target=/app/data --env-file .env.production jenera:1.0.0
```

Supply runtime values from the table above in the ignored `.env.production` file
or the platform's secret manager. Terminate HTTPS at a reverse proxy and forward
the real public host/origin. Enforce an upload limit of about 101 MB and permit
up to five minutes for an export response. The container health check uses
`GET /api/health`, which executes the native tools and checks temporary storage;
it also opens the SQLite journal without calling Higgsfield or exposing secrets.

Keep the named data volume across upgrades and restarts. It holds per-key budgets,
estimated reservations and accepted generation receipts. Back it up using SQLite's
backup API or stop the server before copying the database and its WAL files.
Do not share SQLite across network filesystems or independent replicas. Horizontal
scaling requires a shared transactional journal and rate limiter first. Protect
the volume: receipts may include signed provider request URLs. Database files,
environment files and verification artifacts are excluded from release packaging.

Default estimated budgets are $5 per request and $25 per UTC day, adjustable by
the connected customer. They apply to this installation's tracked requests, not
other apps, the provider balance or an actual billing ceiling. Unknown pricing
blocks submission. A reservation with an uncertain response remains counted;
resume the original intent rather than starting another generation. Failed,
blocked or canceled jobs release the reservation when polling confirms that state.

## Public service operation

- Block framing, preserve response security headers and add HTTPS transport
  policy at your TLS ingress.
- Monitor readiness, HTTP failures, memory, temporary disk use and render
  duration. Keep credential values, authorization headers and signed URLs out
  of access/error logs.
- Connection verification requests an unused signed upload slot, not a paid
  generation. Invalid credentials never receive a connection cookie.
- Request limits are per process, with per-credential and instance limits.
  Add a shared rate limiter and trusted ingress limits before horizontal scaling.
- Keep a customer export running on the same instance until its response finishes.
  There is no persistent server job queue. Sequence generation advances in the
  browser, so the tab must stay open; accepted provider jobs recover after refresh.
- Browser projects are not server backups. Provide the in-app export/import flow;
  there is no cloud sync or customer account database in this release.
- Publish your operator identity, support contact and service terms before a
  commercial launch. The in-app privacy page documents actual technical data flow.

GitHub pushes and CI do not provision a host or domain. Live hosting acceptance
requires a real deployment and a provider-connected upload/generation/export check.
