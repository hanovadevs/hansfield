"use client";
import { useEffect, useState } from "react";
import { assemblePlane } from "@/generation/plane";
import { validatePlane } from "@/generation/validate";
import { estimateGeneration } from "@/generation/client";
import { usd, type SpendQuote } from "@/generation/pricing";
import { useActive } from "@/generation/stores/active";
import { countSetting } from "./data";
import { getModel } from "@/generation/catalog";

export function PricePreview({ fingerprint }: { fingerprint: string }) {
  const [quote, setQuote] = useState<SpendQuote | null>(null);
  const [note, setNote] = useState("Write a prompt to check the cost.");
  useEffect(() => {
    let live = true;
    setQuote(null);
    let plane: ReturnType<typeof assemblePlane>;
    try {
      plane = validatePlane(assemblePlane());
    } catch {
      setNote("Complete your scene to check pricing.");
      return;
    }
    setNote("Checking provider pricing…");
    const timer = setTimeout(() => {
      const count = countSetting(getModel(plane.model))
        ? 1
        : useActive.getState().batch;
      void estimateGeneration(plane, count)
        .then((quote) => {
          if (live) {
            setQuote(quote);
            setNote(
              quote.kind === "account"
                ? "Provider estimate"
                : "List-price estimate · before discounts",
            );
          }
        })
        .catch((error) => {
          if (live)
            setNote(
              error.status === 401
                ? "Connect your account to see pricing."
                : "Pricing needs review before generation.",
            );
        });
    }, 700);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [fingerprint]);
  return (
    <div className="price-preview" aria-live="polite">
      <div>
        <span>Estimated total</span>
        <strong>{quote ? usd(quote.totalUsd) : "—"}</strong>
      </div>
      <small>
        {note}
        {quote && quote.count > 1 ? ` · ${quote.count} paid requests` : ""}
      </small>
    </div>
  );
}
