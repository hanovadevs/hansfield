import type { Metadata } from "next";
import { InfoShell } from "../info-shell";

export const metadata: Metadata = {
  title: "Help",
  alternates: { canonical: "/help" },
};

export default function HelpPage() {
  return (
    <InfoShell>
      <h1>Your first film, step by step.</h1>
      <p className="info-lead">
        Start with one shot or build a connected sequence. Your Higgsfield API
        account pays for generation; editing and export submit no generation
        requests.
      </p>
      <div className="info-grid">
        <section className="info-card">
          <h2>Connect and create</h2>
          <ol>
            <li>
              Create an API key and fund your API balance at{" "}
              <a
                href="https://open.higgsfield.ai"
                target="_blank"
                rel="noreferrer"
              >
                Open Higgsfield
              </a>
              . API billing is separate from a Higgsfield website subscription.
            </li>
            <li>
              Choose <strong>Connect Higgsfield</strong> and enter the complete{" "}
              <code>KEY_ID:KEY_SECRET</code>. Jenera verifies it before saving
              an encrypted browser connection.
            </li>
            <li>
              In <strong>Studio</strong>, describe your scene, choose a model
              and add supported references. Open{" "}
              <strong>Creative controls</strong> when you need precise
              direction. Review and approve the cost before submission.
            </li>
          </ol>
        </section>
        <section className="info-card">
          <h2>Build a film</h2>
          <ol>
            <li>
              Open <strong>Films → New film</strong>. Write one story beat per
              line, set the length, and create your shot plan.
            </li>
            <li>
              In <strong>Shots</strong>, generate the sequence. A connected shot
              uses the previous kept ending; shared notes guide character and
              visual consistency.
            </li>
            <li>
              Trim, split at the playhead, reorder, or make an alternate cut.{" "}
              <strong>Review</strong> plays the sequence;{" "}
              <strong>Export</strong> renders the chosen shots into an MP4.
            </li>
          </ol>
        </section>
        <section className="info-card">
          <h2>Keep your work</h2>
          <p>
            Projects and history are saved in this browser, with no cloud sync.
            Use <strong>Export board</strong> to save a project backup and{" "}
            <strong>Import project</strong> to reopen it elsewhere. Download
            finished media promptly; provider links can expire.
          </p>
          <p>
            Keep the tab open while a sequence generates. Accepted jobs recover
            after refresh. Resume an uncertain submission instead of starting
            another paid request. Stop after the current shot to pause the
            sequence, or cancel an accepted shot through the provider.
          </p>
        </section>
        <section className="info-card">
          <h2>Review costs and budgets</h2>
          <p>
            Open <strong>Usage</strong> for your request journal, request IDs,
            CSV export and spending controls. Defaults are $5 per request and
            $25 per UTC day, adjustable for your connected key. Each film shot
            has its own cost review. Canceling that review submits no
            generation.
          </p>
          <p>
            Prices are estimates. Calculated token prices are before discounts;
            final charges come from Higgsfield. Limits cover tracked Jenera
            requests, including pending reservations, and cannot cap spending in
            other apps. Older history has no verified cost. Open provider
            billing for actual charges.
          </p>
        </section>
        <section className="info-card">
          <h2>Useful shortcuts and limits</h2>
          <p>
            <kbd>Ctrl / Cmd</kbd> + <kbd>K</kbd> opens tool search.
            <kbd>Ctrl / Cmd</kbd> + <kbd>Enter</kbd> opens cost review from the
            composer. <kbd>Ctrl / Cmd</kbd> + <kbd>Z</kbd> undoes timeline
            edits; add <kbd>Shift</kbd> to redo. <kbd>Esc</kbd> closes dialogs.
          </p>
          <p>
            Up to 40 shots and 10 minutes per export. Source uploads are limited
            to 100 MB per file; an export can download up to 500 MB total.
            Choose landscape, portrait or square at 720p or 1080p. Crossfades
            overlap clips and shorten the final duration.
          </p>
          <p>
            Generation quality, timing, model access and charges depend on
            Higgsfield. Continuity references guide the model; review the
            results before final export.
          </p>
        </section>
      </div>
    </InfoShell>
  );
}
