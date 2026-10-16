import http from "node:http";
import { readFile } from "node:fs/promises";
import snapshot from "../src/generation/catalog/api-schemas.json" with { type: "json" };

const jobs = new Map();
const intents = new Map();
const origin = "http://127.0.0.1:4319";
const json = (res, status, body) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
};
http
  .createServer(async (req, res) => {
    const path = new URL(req.url, origin).pathname;
    if (path === "/health") return json(res, 200, { ok: true });
    if (path === "/media/image.svg") {
      res.writeHead(200, {
        "Content-Type": "image/svg+xml",
        "Access-Control-Allow-Origin": "*",
      });
      return res.end(
        '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#596946"/><circle cx="480" cy="90" r="45" fill="#ead9a7"/></svg>',
      );
    }
    if (path === "/media/video.mp4") {
      try {
        const bytes = await readFile(
          new URL("./fixtures/preview.mp4", import.meta.url),
        );
        const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? "");
        const start = range ? Number(range[1]) : 0;
        const end =
          range && range[2]
            ? Math.min(Number(range[2]), bytes.length - 1)
            : bytes.length - 1;
        if (start > end || start >= bytes.length) {
          res.writeHead(416, { "Content-Range": `bytes */${bytes.length}` });
          return res.end();
        }
        res.writeHead(range ? 206 : 200, {
          "Content-Type": "video/mp4",
          "Access-Control-Allow-Origin": "*",
          "Accept-Ranges": "bytes",
          ...(range
            ? { "Content-Range": `bytes ${start}-${end}/${bytes.length}` }
            : {}),
          "Content-Length": end - start + 1,
        });
        return res.end(bytes.subarray(start, end + 1));
      } catch {
        return json(res, 404, { error: "Missing preview fixture" });
      }
    }
    if (!["Key test:secret", "Key customer:second"].includes(req.headers.authorization))
      return json(res, 401, { detail: "Invalid credentials" });
    if(path.startsWith("/estimate/")) return json(res,200,{type:"estimate",usd:"0.05",credits:"1.0",discount:null});
    if (path === "/files/generate-upload-url") return json(res, 200, {
      upload_url: "https://fixture.cloudfront.net/unused-upload", public_url: "https://fixture.cloudfront.net/unused-reference.png", upload_headers: {},
    });
    const match = /^\/requests\/([^/]+)\/(status|cancel)$/.exec(path);
    if (match) {
      const job = jobs.get(match[1]);
      if (!job || job.owner !== req.headers.authorization) return json(res, 404, { detail: "Not found" });
      if (match[2] === "cancel") {
        job.canceled = true;
        res.writeHead(202);
        return res.end();
      }
      job.polls++;
      if (job.input.prompt.includes("[transient]") && job.polls === 1)
        return json(res, 503, { detail: "Temporary upstream outage" });
      const status = job.canceled
        ? "canceled"
        : job.input.prompt.includes("[queued]")
          ? "queued"
          : job.polls < 2
            ? "in_progress"
            : "completed";
      return json(res, 200, {
        request_id: match[1],
        status,
        ...(status === "completed"
          ? job.image
            ? {
                images: Array.from(
                  { length: job.input.batch_size ?? 1 },
                  () => ({ url: `${origin}/media/image.svg` }),
                ),
              }
            : { video: { url: `${origin}/media/video.mp4` } }
          : {}),
      });
    }
    if (req.method !== "POST")
      return json(res, 405, { detail: "Method not allowed" });
    let raw = "";
    for await (const chunk of req) raw += chunk;
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      return json(res, 400, { detail: "Invalid JSON" });
    }
    if (input.prompt?.includes("[reject]"))
      return json(res, 422, { detail: "Test input rejected" });
    const schema = snapshot.endpoints[path.slice(1)]?.schema;
    if (!schema) return json(res, 404, { detail: "Undocumented endpoint" });
    for (const key of schema.required ?? [])
      if (input[key] === undefined)
        return json(res, 422, { detail: `Missing ${key}` });
    for (const [key, value] of Object.entries(input)) {
      const field = schema.properties[key];
      if (
        !field ||
        (field.enum && !field.enum.includes(value)) ||
        (field.type === "integer" && !Number.isInteger(value))
      )
        return json(res, 422, { detail: `Invalid ${key}` });
    }
    const key = `${req.headers.authorization}:${req.headers["idempotency-key"]}`;
    const id = intents.get(key) ?? crypto.randomUUID();
    if (!jobs.has(id)) {
      intents.set(key, id);
      jobs.set(id, {
        owner: req.headers.authorization,
        input,
        image: /soul|text-to-image|image-2|ideogram|z-image/.test(path),
        polls: 0,
      });
    }
    return json(res, 200, {
      request_id: id,
      status: "queued",
      status_url: `${origin}/requests/${id}/status`,
      cancel_url: `${origin}/requests/${id}/cancel`,
    });
  })
  .listen(4319, "127.0.0.1", () =>
    console.log("Mock Higgsfield ready on 4319"),
  );
