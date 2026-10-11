import { getGenerationStatuses } from "./client";
import type { GenerationStatus, StatusResult } from "./platform";

const TERMINAL = new Set(["completed", "failed", "nsfw", "canceled"]);
export const POLL_INTERVAL_MS = 2000;
export const POLL_DEADLINE_MS = 30 * 60_000;
type Waiter = {
  deadline: number;
  statusUrl?: string;
  misses: number;
  onProgress?: (status: string) => void;
  resolve: (status: GenerationStatus) => void;
  reject: (reason: Error) => void;
};
const waiting = new Map<string, Waiter>();
const inflight = new Map<string, Promise<GenerationStatus>>();
let timer: ReturnType<typeof setTimeout> | null = null;
let polling = false;
let delay = POLL_INTERVAL_MS;
let epoch = 0;

export function watchRequest(
  requestId: string,
  opts?: {
    deadline?: number;
    statusUrl?: string;
    onProgress?: (status: string) => void;
  },
): Promise<GenerationStatus> {
  const existing = inflight.get(requestId);
  if (existing) return existing;
  delay = POLL_INTERVAL_MS;
  const promise = new Promise<GenerationStatus>((resolve, reject) => {
    waiting.set(requestId, {
      deadline: opts?.deadline ?? Date.now() + POLL_DEADLINE_MS,
      statusUrl: opts?.statusUrl,
      misses: 0,
      onProgress: opts?.onProgress,
      resolve: (status) => {
        inflight.delete(requestId);
        resolve(status);
      },
      reject: (error) => {
        inflight.delete(requestId);
        reject(error);
      },
    });
    schedule();
  });
  inflight.set(requestId, promise);
  return promise;
}

export function stopWatching(): void {
  epoch++;
  if (timer !== null) clearTimeout(timer);
  timer = null;
  const waiters = [...waiting.values()];
  waiting.clear();
  inflight.clear();
  delay = POLL_INTERVAL_MS;
  for (const waiter of waiters) waiter.reject(new Error("Watching stopped"));
}
function schedule() {
  if (timer !== null || polling || !waiting.size) return;
  timer = setTimeout(() => void round(), delay + Math.random() * 300);
}
async function round() {
  timer = null;
  polling = true;
  const generation = epoch;
  const entries = [...waiting].slice(0, 50);
  try {
    const results = await getGenerationStatuses(
      entries.map(([requestId, waiter]) => ({
        requestId,
        statusUrl: waiter.statusUrl,
      })),
    );
    if (generation !== epoch) return;
    for (const result of results) deliver(result);
    for (const [id, waiter] of entries) {
      if (waiting.get(id) === waiter) {
        waiting.delete(id);
        waiting.set(id, waiter);
      }
    }
  } catch (error) {
    if (generation !== epoch) return;
    for (const [requestId] of entries)
      deliver({
        requestId,
        error:
          error instanceof Error ? error.message : "Connection interrupted",
        retryable: true,
      });
  } finally {
    polling = false;
    if (generation === epoch) {
      for (const [requestId, waiter] of waiting) {
        if (Date.now() <= waiter.deadline) continue;
        waiting.delete(requestId);
        waiter.reject(
          new Error(
            "Status check timed out. The job may still be running; resume tracking to check it.",
          ),
        );
      }
      delay = Math.min(delay * 1.35, 10000);
    }
    schedule();
  }
}
function deliver(result: StatusResult) {
  const waiter = waiting.get(result.requestId);
  if (!waiter) return;
  if ("error" in result) {
    if (result.retryable && ++waiter.misses < 6) return;
    waiting.delete(result.requestId);
    waiter.reject(new Error(result.error));
    return;
  }
  waiter.misses = 0;
  waiter.onProgress?.(result.status.status);
  if (!TERMINAL.has(result.status.status)) return;
  waiting.delete(result.requestId);
  waiter.resolve(result.status);
}
