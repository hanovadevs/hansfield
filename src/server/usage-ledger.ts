import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { QueuedGeneration } from "@/generation/platform";
import type { QuoteClaim } from "./spend-quotes";
import { RequestGuardError } from "./request-guard";

export type UsageEntry = { intent:string; model:string; resolution:string; duration:number; estimateUsd:number; priceKind:string; state:string; requestId:string|null; correlationId:string|null; createdAt:number; receipt:QueuedGeneration|null };
const state=globalThis as typeof globalThis & { jeneraLedger?:{ filename:string; db:DatabaseSync } };
export function ledgerDatabase() {
  const directory=path.resolve(process.env.JENERA_DATA_DIR || "data");
  const filename=path.join(directory,"usage.sqlite");
  if(state.jeneraLedger?.filename===filename) return state.jeneraLedger.db;
  mkdirSync(directory,{recursive:true});
  const db=new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS limits(account TEXT PRIMARY KEY, request_micro INTEGER NOT NULL, daily_micro INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS usage(account TEXT NOT NULL,intent TEXT NOT NULL,digest TEXT NOT NULL,approval TEXT NOT NULL,model TEXT NOT NULL,resolution TEXT NOT NULL,duration REAL NOT NULL,estimate_micro INTEGER NOT NULL,kind TEXT NOT NULL,state TEXT NOT NULL,request_id TEXT,correlation_id TEXT,receipt TEXT,created_at INTEGER NOT NULL,PRIMARY KEY(account,intent));
    CREATE INDEX IF NOT EXISTS usage_day ON usage(account,created_at);`);
  state.jeneraLedger={filename,db};return db;
}
const micro=(usd:number)=>Math.ceil(usd*1e6);
function limits(account:string) {
  const db=ledgerDatabase();
  db.prepare("INSERT OR IGNORE INTO limits VALUES(?,?,?)").run(account,5e6,25e6);
  return db.prepare("SELECT request_micro,daily_micro FROM limits WHERE account=?").get(account) as {request_micro:number;daily_micro:number};
}
function entry(row:Record<string,unknown>):UsageEntry {
  return {intent:String(row.intent),model:String(row.model),resolution:String(row.resolution),duration:Number(row.duration),estimateUsd:Number(row.estimate_micro)/1e6,priceKind:String(row.kind),state:String(row.state),requestId:row.request_id as string|null,correlationId:row.correlation_id as string|null,createdAt:Number(row.created_at),receipt:row.receipt?JSON.parse(String(row.receipt)):null};
}
export function findIntent(account:string,intent:string) { const row=ledgerDatabase().prepare("SELECT * FROM usage WHERE account=? AND intent=?").get(account,intent);return row?entry(row):null; }
export function usageSummary(account:string) {
  const db=ledgerDatabase();const caps=limits(account);const date=new Date();date.setUTCHours(0,0,0,0);
  const total=db.prepare("SELECT COALESCE(SUM(estimate_micro),0) AS total FROM usage WHERE account=? AND created_at>=? AND state NOT IN ('failed','nsfw','canceled','rejected')").get(account,date.getTime()) as {total:number};
  return {requestLimitUsd:caps.request_micro/1e6,dailyLimitUsd:caps.daily_micro/1e6,todayEstimatedUsd:Number(total.total)/1e6,resetAt:date.getTime()+86400000,entries:db.prepare("SELECT * FROM usage WHERE account=? ORDER BY created_at DESC LIMIT 300").all(account).map(entry)};
}
export function setUsageLimits(account:string,requestLimit:number,dailyLimit:number) {
  if(!Number.isFinite(requestLimit)||!Number.isFinite(dailyLimit)||requestLimit<.01||dailyLimit<requestLimit||requestLimit>100||dailyLimit>1000)throw new RequestGuardError("Use a request limit between $0.01 and $100 and a daily budget up to $1,000, at least as large as the request limit.",400);
  ledgerDatabase().prepare("INSERT INTO limits VALUES(?,?,?) ON CONFLICT(account) DO UPDATE SET request_micro=excluded.request_micro,daily_micro=excluded.daily_micro").run(account,micro(requestLimit),micro(dailyLimit));
  return usageSummary(account);
}
export function reserveUsage(account:string,intent:string,digest:string,claim:QuoteClaim,model:string,input:Record<string,unknown>) {
  const db=ledgerDatabase();db.exec("BEGIN IMMEDIATE");
  try {
    const row=db.prepare("SELECT * FROM usage WHERE account=? AND intent=?").get(account,intent);
    if(row){if(row.digest!==digest)throw new RequestGuardError("This request identifier was already used for different inputs.",409);db.exec("COMMIT");return entry(row);}
    const summary=usageSummary(account);
    if(claim.unitUsd>summary.requestLimitUsd+1e-6||micro(summary.todayEstimatedUsd)+micro(claim.unitUsd)>micro(summary.dailyLimitUsd))throw new RequestGuardError("This generation exceeds your request limit or tracked daily budget. Open Usage to review your limits.",402);
    const uses=db.prepare("SELECT count(*) AS total FROM usage WHERE account=? AND approval=?").get(account,claim.id) as {total:number};
    if(Number(uses.total)>=claim.count)throw new RequestGuardError("This cost approval has already been used.",409);
    db.prepare("INSERT INTO usage(account,intent,digest,approval,model,resolution,duration,estimate_micro,kind,state,created_at) VALUES(?,?,?,?,?,?,?,?,?,'uncertain',?)").run(account,intent,digest,claim.id,model,String(input.resolution??"Default"),Number(input.duration??0),micro(claim.unitUsd),claim.kind,Date.now());
    db.exec("COMMIT");return null;
  } catch(error){db.exec("ROLLBACK");throw error;}
}
export function saveReceipt(account:string,intent:string,receipt:QueuedGeneration) {
  ledgerDatabase().prepare("UPDATE usage SET state=?,request_id=?,correlation_id=?,receipt=? WHERE account=? AND intent=?").run(receipt.status,receipt.requestId,receipt.correlationId??null,JSON.stringify(receipt),account,intent);
}
export function updateUsageState(account:string,requestId:string,status:string) { ledgerDatabase().prepare("UPDATE usage SET state=? WHERE account=? AND request_id=?").run(status,account,requestId); }
export function rejectIntent(account:string,intent:string) { ledgerDatabase().prepare("UPDATE usage SET state='rejected' WHERE account=? AND intent=? AND request_id IS NULL").run(account,intent); }
