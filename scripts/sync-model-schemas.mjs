import { writeFile } from "node:fs/promises";

// Model references are authoritative. The supplementary OpenAPI omits most models.
const origin = "https://docs.higgsfield.ai";
const groups = [
  "soul-2",
  "soul-cinema",
  "seedance-2",
  "seedance-2-5",
  "kling-3",
  "kling-3-motion-control",
  "kling-2-5-turbo",
  "kling-2-6",
  "kling-o3",
  "kling-omni",
  "flux-2",
  "flux-3",
  "grok-image-2",
  "ideogram-4",
  "recraft-4-1",
  "qwen-image-3",
  "z-image-turbo",
  "wan-3",
  "wan-3-prime",
  "wan-2-7",
  "wan-2-6",
  "minimax-h3",
  "hailuo-2-3",
  "happy-horse-1",
  "happyhorse-1-1",
  "ltx-2-5",
  "grok-imagine-video-1-5",
  "pixverse-v6",
  "cinema-studio-4",
  "genjutsu",
];
const pending = ["video-generation", "image-generation", ...groups].map(
  (g) => `/docs/models/${g}.md`,
);
const seen = new Set();
const schemas = {};
const failures = [];
async function worker() {
  while (pending.length) {
    const path = pending.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    try {
      const response = await fetch(`${origin}${path}`, {
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) {
        failures.push(`${path}: ${response.status}`);
        continue;
      }
      const markdown = await response.text();
      const endpoint = markdown.match(/\*\*Endpoint ID:\*\*\s*`([^`]+)`/)?.[1];
      if (endpoint) {
        for (const match of markdown.matchAll(
          /```json[^\n]*\n([\s\S]*?)\n\s*```/g,
        )) {
          try {
            const schema = JSON.parse(match[1]);
            if (schema.properties)
              schemas[endpoint] = {
                source: `${origin}${path.replace(/\.md$/, "")}`,
                schema,
              };
          } catch {
            /* Example blocks are not always JSON schemas. */
          }
        }
      } else {
        const links = [
          ...markdown.matchAll(/\]\((\/docs\/models\/[^)#]+)\)/g),
          ...markdown.matchAll(/href="(\/docs\/models\/[^"#]+)"/g),
        ];
        for (const match of links) {
          const next = match[1].replace(/\.md$/, "") + ".md";
          if (!seen.has(next)) pending.push(next);
        }
      }
    } catch (error) {
      failures.push(`${path}: ${error.message}`);
    }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
if (Object.keys(schemas).length < 10)
  throw new Error("Incomplete schema fetch; existing snapshot preserved.");
await writeFile(
  new URL("../src/generation/catalog/api-schemas.json", import.meta.url),
  JSON.stringify(
    {
      verifiedAt: "2026-10-09",
      endpoints: Object.fromEntries(
        Object.entries(schemas).sort(([a], [b]) => a.localeCompare(b)),
      ),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Saved ${Object.keys(schemas).length} documented endpoint schemas from ${seen.size} references.`,
);
if (failures.length)
  console.log("Missing overview references:\n" + failures.join("\n"));
