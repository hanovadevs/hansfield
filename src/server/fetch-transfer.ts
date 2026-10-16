/** Retry only replayable reads/storage writes; never generation submissions. */
export async function fetchTransfer(
  url: string | URL,
  init: Omit<RequestInit, "signal" | "method" | "body"> & {
    method?: "GET" | "PUT";
    body?: string | Uint8Array<ArrayBuffer> | ArrayBuffer | Blob;
  },
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const transient =
        error instanceof Error &&
        (error.name === "TimeoutError" ||
          (error instanceof TypeError &&
            /fetch failed|failed to fetch|terminated/i.test(error.message)));
      if (attempt || !transient) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
      continue;
    }
    if (!attempt && [408, 429, 500, 502, 503, 504].includes(response.status)) {
      await response.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, 250));
      continue;
    }
    return response;
  }
}
