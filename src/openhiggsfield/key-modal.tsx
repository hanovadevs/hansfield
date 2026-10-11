"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  clearPlatformCredentials,
  savePlatformCredentials,
} from "@/generation/actions";

import { CloseIcon } from "./icons";

export function KeyModal({
  configured,
  onClose,
  onSaved,
  onCleared,
}: {
  configured: boolean;
  onClose: () => void;
  onSaved: () => void;
  onCleared: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
    panelRef.current?.focus();
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await savePlatformCredentials({ api_key: apiKey });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save the key",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onClear() {
    setBusy(true);
    setError(null);
    try {
      await clearPlatformCredentials();
      setApiKey("");
      onCleared();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not remove the key",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="ohf-keys-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="ohf-dialog-panel ohf-keys-panel"
      >
        <div className="ohf-keys-head">
          <div>
            <div id="ohf-keys-title" className="ohf-keys-title">
              Connect to Higgsfield
            </div>
            <p className="ohf-keys-copy">
              {configured
                ? "This browser has a verified API connection. Replace or disconnect it below."
                : "Connect your own Higgsfield API account. Generations use its API balance."}
            </p>
            <a
              className="studio-key-link"
              href="https://open.higgsfield.ai"
              target="_blank"
              rel="noreferrer"
            >
              Open Higgsfield console ↗
            </a>
          </div>
          <button
            type="button"
            className="ohf-icon-btn"
            aria-label="Close"
            onClick={onClose}
          >
            <CloseIcon size={13} />
          </button>
        </div>

        <form
          className="ohf-keys-form"
          onSubmit={(event) => void onSubmit(event)}
        >
          <label className="ohf-field">
            <div className="ohf-field-label">API key</div>
            <input
              className="ohf-input ohf-input--mono"
              name="api_key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={apiKey}
              placeholder="KEY_ID:KEY_SECRET"
              required
              onChange={(event) => setApiKey(event.target.value)}
            />
          </label>

          <p className="connection-privacy">
            Your key is encrypted in an HTTP-only cookie for 30 days. Projects
            stay in this browser.{" "}
            <a href="/privacy" target="_blank" rel="noreferrer">
              Privacy
            </a>
          </p>

          {error && (
            <div className="ohf-alert" role="alert">
              <span className="ohf-alert-text">{error}</span>
            </div>
          )}

          <div className="ohf-keys-actions">
            {configured && (
              <button
                type="button"
                className="ohf-btn-quiet"
                disabled={busy}
                onClick={() => void onClear()}
              >
                Disconnect
              </button>
            )}
            <button
              type="submit"
              className="ohf-keys-save"
              disabled={busy || !apiKey.trim()}
            >
              {busy
                ? "Verifying…"
                : configured
                  ? "Replace key"
                  : "Connect account"}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
