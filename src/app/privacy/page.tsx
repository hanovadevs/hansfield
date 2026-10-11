import type { Metadata } from "next";
import { InfoShell } from "../info-shell";

export const metadata: Metadata = {
  title: "Privacy and data",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <InfoShell>
      <h1>Where your work lives.</h1>
      <p className="info-lead">
        Jenera is an independent studio. You connect your own Higgsfield API
        account; this release has no Jenera account database or cloud project
        sync.
      </p>
      <div className="info-grid">
        <section className="info-card">
          <h2>Your API connection</h2>
          <p>
            Your API key is sent over the site's HTTPS connection and verified
            with Higgsfield. The server encrypts it in an HTTP-only, same-site
            cookie with a 30-day expiry. Browser JavaScript cannot read that
            cookie. Jenera decrypts the key on the server to authorize your
            provider requests.
          </p>
          <p>
            Use <strong>Higgsfield connected → Disconnect</strong> to remove the
            connection. You can revoke the API key in the Higgsfield console at
            any time. Disconnecting preserves your local projects and downloads.
          </p>
        </section>
        <section className="info-card">
          <h2>Your projects and media</h2>
          <p>
            Prompts, model controls and film projects are stored in local
            storage; generation history and favorites are stored in IndexedDB.
            These stay in this browser profile and are not synchronized to
            another device. Clearing site data removes them.
          </p>
          <p>
            Project backups include prompts, settings, notes and media URLs.
            They do not include your API key. Keep those files private if your
            work is confidential.
          </p>
        </section>
        <section className="info-card">
          <h2>What leaves your browser</h2>
          <p>
            Generation sends your prompt, settings and references to Higgsfield.
            Uploads pass through the Jenera server to the provider's signed
            media storage. Playback fetches media from its provider URL.
          </p>
          <p>
            Editing and export send clip URLs and cut settings to Jenera. The
            server downloads those clips to temporary files, processes them with
            FFmpeg and removes its working directory when the operation
            finishes. MP4s and continuity frames return to your browser; frames
            used for the next shot are uploaded as provider references.
          </p>
        </section>
        <section className="info-card">
          <h2>Service operation</h2>
          <p>
            This release includes no advertising or analytics SDK. The hosting
            operator and Higgsfield can still receive normal request metadata
            and maintain their own operational logs. Provider retention and
            output policies are governed by your Higgsfield agreement.
          </p>
          <p>
            Jenera stores no customer API keys in a database. The server still
            handles your key to forward requests, so only connect to a
            deployment whose operator you trust.
          </p>
        </section>
      </div>
    </InfoShell>
  );
}
