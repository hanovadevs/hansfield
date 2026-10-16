"use client";
import { useEffect,useRef } from "react";
import { useSpendReview } from "@/generation/spend-review";
import { usd } from "@/generation/pricing";

export function CostReview() {
  const item=useSpendReview(s=>s.queue[0]);
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(item)ref.current?.showModal();},[item]);
  if(!item)return null;
  const quote=item.quote;
  return <dialog ref={ref} className="cost-dialog" aria-labelledby="cost-title" onCancel={event=>{event.preventDefault();item.cancel();}}>
    <div className="cost-panel">
      <div className="cost-kicker">SPENDING REVIEW</div><h2 id="cost-title">Review generation cost</h2>
      <p className="cost-label">{item.label}</p>
      <div className="cost-total">{usd(quote.totalUsd)}<span>{quote.kind==="account"?"provider estimate":"estimated before discounts"}</span></div>
      <dl className="cost-facts"><div><dt>Model</dt><dd>{quote.model.split("/").slice(0,2).join(" / ")}</dd></div><div><dt>Output</dt><dd>{quote.duration?`${quote.duration}s · `:""}{quote.resolution}{quote.dimensions?` · ${quote.dimensions}`:""}</dd></div><div><dt>Paid requests</dt><dd>{quote.count} × {usd(quote.usd)}</dd></div></dl>
      <p className="cost-note">{quote.description}</p>
      <p className="cost-note">This uses your connected Higgsfield account. Each film shot is reviewed separately. Editing and exporting do not generate new footage.</p>
      <div className="cost-actions"><button type="button" onClick={item.cancel}>Cancel</button><button type="button" className="cost-approve" onClick={item.accept}>Approve {usd(quote.totalUsd)} estimate</button></div>
    </div>
  </dialog>;
}
