"use client";
import { useEffect,useMemo,useState } from "react";
import type { RunRecord } from "./history";
import type { usageSummary } from "@/server/usage-ledger";
import { usd } from "@/generation/pricing";
import { downloadBlob } from "@/film/client";

type Summary=ReturnType<typeof usageSummary>;
export function UsageCenter({history,onConnect}:{history:RunRecord[];onConnect:()=>void}) {
  const [data,setData]=useState<Summary|null>(null);
  const [error,setError]=useState("");const[message,setMessage]=useState("");
  const [requestLimit,setRequestLimit]=useState("5");const[dailyLimit,setDailyLimit]=useState("25");
  const[search,setSearch]=useState("");const[busy,setBusy]=useState(false);
  async function refresh(){setBusy(true);try{const response=await fetch("/api/usage",{cache:"no-store"});const payload=await response.json();if(!response.ok)throw new Error(payload.error);setData(payload);setRequestLimit(String(payload.requestLimitUsd));setDailyLimit(String(payload.dailyLimitUsd));setError("");}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
  useEffect(()=>{void refresh();},[]);
  const rows=useMemo(()=>{
    const remote=(data?.entries??[]).map(entry=>({...entry,prompt:history.find(record=>record.requestId===entry.requestId)?.prompt??""}));
    const known=new Set(remote.map(entry=>entry.requestId));
    // Older rows have no dollar evidence. Never fabricate a charge for them.
    const legacy=history.filter(record=>record.requestId&&!known.has(record.requestId)).map(record=>({intent:record.id,model:record.modelLabel,resolution:String(record.settings?.resolution??record.meta),duration:Number(record.settings?.duration??0),estimateUsd:null,priceKind:"legacy",state:record.status,requestId:record.requestId!,correlationId:null,createdAt:record.createdAt,receipt:null,prompt:record.prompt}));
    return [...remote,...legacy].filter(row=>`${row.model} ${row.prompt} ${row.requestId}`.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>b.createdAt-a.createdAt);
  },[data,history,search]);
  async function saveLimits(){setBusy(true);try{const response=await fetch("/api/usage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requestLimitUsd:Number(requestLimit),dailyLimitUsd:Number(dailyLimit)})});const payload=await response.json();if(!response.ok)throw new Error(payload.error);setData(payload);setError("");setMessage("Budgets saved for this API connection.");}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
  function exportCsv(){const cell=(value:unknown)=>`"${String(value??"").replaceAll('"','""')}"`;const csv=[["created_at","model","resolution","seconds","status","request_id","correlation_id","estimated_usd","price_source"],...rows.map(row=>[new Date(row.createdAt).toISOString(),row.model,row.resolution,row.duration,row.state,row.requestId,row.correlationId,row.estimateUsd,row.priceKind])].map(row=>row.map(cell).join(",")).join("\r\n");downloadBlob(new Blob([csv],{type:"text/csv"}),"jenera-usage.csv");}
  return <section className="usage-center" aria-label="Usage and budgets">
    <div className="workspace-page-head"><div><span className="workspace-eyebrow">ACCOUNT WORKSPACE</span><h1>Usage & budgets</h1><p>Know what you approve. Trace every request.</p></div><div className="workspace-page-actions"><button onClick={()=>void refresh()} disabled={busy}>Refresh usage</button><button onClick={exportCsv}>Export usage CSV</button><a href="https://open.higgsfield.ai/usage" target="_blank" rel="noreferrer">Provider billing ↗</a></div></div>
    {error&&<div className="workspace-error" role="alert">{error}<button onClick={onConnect}>Manage connection</button></div>}
    <div className="usage-summary"><article><span>Tracked today · UTC</span><strong>{usd(data?.todayEstimatedUsd)}</strong><small>Estimates and pending reservations</small></article><article><span>Daily budget</span><strong>{usd(data?.dailyLimitUsd)}</strong><small>{data?`${usd(Math.max(0,data.dailyLimitUsd-data.todayEstimatedUsd))} remaining`:"Connect to load your account"}</small></article><article><span>Request approval limit</span><strong>{usd(data?.requestLimitUsd)}</strong><small>Checked on the server before submission</small></article></div>
    <p className="usage-disclosure">This journal tracks Jenera requests for the connected key. It is not your Higgsfield balance or an invoice; other apps and older requests are not included in its totals. Calculated estimates use list pricing before discounts. Confirm actual charges in provider billing.</p>
    <div className="usage-budget-card"><div><h2>Your spending controls</h2><p>Separate limits for each connected API key. Failed or canceled requests release their tracked reservation once the provider reports the terminal status.</p></div><label>Per request (USD)<input aria-label="Per-request budget" type="number" min="0.01" max="100" step="0.01" value={requestLimit} onChange={event=>setRequestLimit(event.target.value)}/></label><label>Per day (USD)<input aria-label="Daily budget" type="number" min="0.01" max="1000" step="0.01" value={dailyLimit} onChange={event=>setDailyLimit(event.target.value)}/></label><button onClick={()=>void saveLimits()} disabled={busy||!data}>Save budgets</button></div>
    {message&&<p role="status">{message}</p>}
    <div className="usage-list-head"><h2>Request journal</h2><input aria-label="Search usage" placeholder="Find a prompt, model or request ID…" value={search} onChange={event=>setSearch(event.target.value)}/></div>
    <div className="usage-table-wrap"><table className="usage-table"><thead><tr><th>Creation</th><th>Output</th><th>State</th><th>Estimate</th><th>Provider request</th></tr></thead><tbody>{rows.map(row=><tr key={row.intent}><td><strong>{row.prompt||row.model}</strong><small>{new Date(row.createdAt).toLocaleString()} · {row.model}</small></td><td>{row.duration?`${row.duration}s · `:""}{row.resolution}</td><td><span className={`usage-status usage-status-${row.state}`}>{row.state}</span></td><td>{usd(row.estimateUsd)}<small>{row.priceKind==="legacy"?"No historical cost evidence":row.priceKind==="calculated"?"Before discounts":"Provider estimate"}</small></td><td>{row.requestId?<button className="usage-copy" title="Copy request ID" onClick={()=>void navigator.clipboard.writeText(row.requestId!)}>{row.requestId}</button>:"Not accepted"}{row.correlationId&&<small>Correlation: {row.correlationId}</small>}</td></tr>)}</tbody></table>{!rows.length&&<div className="usage-empty"><h3>No tracked requests yet</h3><p>Each approved generation will appear here with its estimate and request identifier. Existing browser history appears without invented charges.</p></div>}</div>
  </section>;
}
