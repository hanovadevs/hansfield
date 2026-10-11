# Jenera

An independent film studio for creating connected shots, editing sequences, and exporting complete films with your own Higgsfield API account. Built with Next.js 16, React 19, TypeScript, Zustand, and native FFmpeg.

This release prepares the public **bring-your-own-key** product. It includes verified customer connections, encrypted credential cookies, a generated brand kit, production readiness checks, a container recipe and GitHub CI. See [deployment](docs/deployment.md), [launch requirements](docs/launch.md), and [release notes](CHANGELOG.md).

## The studio

- A restrained ivory and sage interface with separate Studio, Films, and Library experiences. Image/video creation shares a focused composer; model details and advanced controls open on demand. Mobile puts creation controls first.
- 35 selectable models: 28 video and 7 image entries. Cinema Studio 4.0 is the default, with native camera movement, lens, aperture, lighting, genre, pacing, era, and color controls. Other families include Kling, Seedance, Wan, LTX, MiniMax, Grok, Recraft, Qwen, Ideogram, and Soul.
- Controls follow the documented schema for the exact text, image, edit, or extension endpoint in use. Reference inputs change available settings. Unsupported inputs and missing required references are rejected before submission.
- Reference images, start/end frames, source video, and audio where supported. Uploads use Higgsfield's signed upload service. Accepted formats are JPG, PNG, WebP, GIF, MP4, and WAV, up to 100 MB per file.
- Separate saved film projects with editable narrative, product and travel starters. Preserve story drafts, rename/search projects, archive/restore them, or duplicate an alternate cut without duplicating accepted generation jobs. Existing single-board storage migrates into a project.
- A dedicated Story → Shots → Review → Export workflow. Direct one shot at a time, open advanced direction/references in a drawer, and undo/redo timeline edits (Ctrl/Cmd+Z outside text fields). Project URLs restore the corresponding locally saved film.
- Automatic continuity: use the previous clip's last kept frame as the next opening frame, or its kept ending as a video reference where the model supports it. Shared notes preserve character, wardrobe and camera instructions. Edited prompts or references flag the affected chain for regeneration.
- Import existing footage or library videos. Trim with sliders or exact times, split at the playhead, duplicate, reorder, mute individual clips, and download individual cuts.
- Review the kept clips in order with a sequence playhead before rendering. Export all ready shots or select shots for another cut, with landscape/portrait/square presets, 720p/1080p and clean cuts or crossfades. Trimming, splitting, reviewing and exporting do not submit generation requests.
- Search/filter the dedicated media library, reuse a creation in the composer, save favorites, download, or delete with undo. History lives in browser IndexedDB; prompts, settings, projects and story drafts persist locally.
- Independently retried status polling, refresh recovery, cancellation, and reviewable failed jobs. Interrupted tracking can resume. Uncertain submissions retain the original inputs and idempotency key for recovery.

The catalog was checked against [Higgsfield's official model documentation](https://docs.higgsfield.ai/). Endpoint schemas and source links are checked in at `src/generation/catalog/api-schemas.json`. Model availability, credits, output quality, and generation times depend on the provider and your account. Each variation submits a separate paid request.

## Run locally

Use Node.js 22.12 or newer and the pinned pnpm. Install from the committed lockfile:

```powershell
npm install --global pnpm@12.5.1
pnpm install --frozen-lockfile
Copy-Item .env.example .env
```

For local development, set the site origin in `.env` and keep the public connection mode:

```dotenv
HF_API_BASE_URL=https://api.higgsfield.ai
JENERA_APP_MODE=byok
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Enter your complete API key through **Connect Higgsfield**. The server verifies it using an unused upload slot, then saves an AES-256-GCM encrypted, HTTP-only cookie. This does not submit a generation. Public mode ignores server API keys, including accidentally configured ones. API billing uses your Higgsfield API balance, separately from its website subscription. Keys and provider authorization stay out of application JavaScript and project backups.

Development can use an ephemeral vault key; connections expire when the process restarts. For a persistent connection, set `SESSION_ENCRYPTION_KEY` to a random 32-byte hex secret. Production requires that secret and a public HTTPS origin. Explicit `JENERA_APP_MODE=private` permits environment credentials for a private deployment behind the operator's access control.

```powershell
pnpm dev
```

Open [localhost:3000](http://localhost:3000). Choose a starting scene or write your own prompt, set the model and output controls, add supported references, and generate. `Ctrl+Enter` / `Cmd+Enter` submits the composer; `Esc` closes dialogs and the media viewer.

For a longer film, open **Films → New film**, write one story beat per line in **Story**, and select a target length, model, shot duration and connection method. Add shared continuity notes, then choose **Create shot plan**. In **Shots**, choose **Generate remaining**; each shot runs after the preceding clip is available. Trim/split, reorder, or open **Advanced direction** for complete model controls and references. **Review** plays the kept sequence; **Export** assembles all or selected shots into an MP4. **Add next shot** extends a sequence. **Alternate cut** duplicates a project while preserving its original. Export dimensions fit footage without stretching; crossfades overlap shots and slightly shorten the final duration. Unrendered shots are explicitly excluded from exports.

Keep the tab open while generating a sequence. Accepted jobs resume after refresh; remaining planned shots require a new click. Uncertain submissions retain their original request identifier and inputs for **Resume shot**. **Stop after current shot** prevents later requests while allowing the current job to finish; **Cancel shot** requests provider cancellation of an accepted shot. Project switching waits for active generation/uploads/exports. Each generated or regenerated shot uses provider credits. Continuity references guide the selected model; visual identity and seamless motion still depend on its output.

The film editor supports up to 40 shots and 10 minutes per export, with a 100 MB source-file limit and 500 MB total downloaded source limit. MP4 processing runs through native FFmpeg and FFprobe on the Node server. The installation permits the FFmpeg binary download. Optional `FFMPEG_PATH` and `FFPROBE_PATH` overrides select installed executables. A deployment needs executable binaries, writable temporary storage and enough runtime/memory for rendering; remote deployment has not been verified.

Public visitors connect their own accounts. Provider requests are authorized with the current customer's API key. Same-origin checks, bounded bodies, request limits and media-processing limits protect the server. Credential readers are server-only modules; callable actions return no secrets. There is no cloud account database or synchronization between browsers. Projects and history remain local; export project backups and download media before provider URLs expire.

## Architecture

The browser submits validated generation planes to Next.js route handlers. The server validates against the selected model's endpoint schema and calls Higgsfield with a stable idempotency key. The client polls status through a batched API, renders returned media URLs, and persists run records locally. The film controller prepares the preceding shot's reference, uploads it when needed, and only then submits the next shot. The media-processing route probes, extracts frames, trims and assembles video using bounded native processes and temporary files. Uploads pass through a validated server route to the provider's signed storage URL. Server actions handle credential cookies.

## Verification

```powershell
pnpm check
pnpm test
pnpm test:e2e
pnpm build
```

Unit tests cover model payloads, reference routing, validation, retry identity, status URL boundaries, uploads, history, shot planning, splitting and downstream invalidation. Native media tests decode real FFmpeg exports and verify audio, dimensions and duration. Browser tests exercise the full UI → server → fixture provider → media flow, including connected-shot references, trim/split/export, playback/download, refresh recovery, stopping sequences, cancellation, transient failures, favorites, undo, and mobile layout. The fixture provider checks payloads against the documented schema snapshot. Browser tests use isolated ports and fake credentials; they never submit paid requests. Run unit and browser suites sequentially because they share the fixture port.

Install Chromium once for browser tests:

```powershell
pnpm exec playwright install chromium
```

An explicitly opted-in real-account smoke test submits one four-second, 480p Cinema Studio generation without audio and saves evidence under ignored `artifacts/`. It uses account credits:

```powershell
$env:HANSFIELD_LIVE_VERIFY='1'
node scripts/verify-live.mjs
```

Recover an already accepted smoke-test request from `artifacts/live-receipt.json` without submitting another generation:

```powershell
node scripts/verify-live.mjs --resume
```

Verify the film editor against that existing live clip, without submitting any new generations:

```powershell
node scripts/verify-film.mjs
```

This saves ending-frame, desktop/mobile screenshots, an exported MP4 and a playback/decoding report under `artifacts/`. It checks editing and export against real footage; automated continuity-generation checks use the fixture provider.

`pnpm models:sync` refreshes the official endpoint schema snapshot; review catalog compatibility and run checks after refreshing. `pnpm brand` rebuilds brand assets. `pnpm build` and `pnpm start` run the production app.

## License

[MIT](LICENSE).
