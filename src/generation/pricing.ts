export type PriceEstimate = {
  usd: number | null;
  kind: "account" | "calculated" | "unavailable";
  description: string;
  dimensions?: string;
};
export type SpendQuote = PriceEstimate & {
  token: string;
  count: number;
  totalUsd: number | null;
  expiresAt: number;
  model: string;
  resolution: string;
  duration: number;
};

export const usd = (amount: number | null | undefined) =>
  amount == null
    ? "Unavailable"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: amount < 0.01 ? 4 : 2,
      }).format(amount);

/** Interpret only the verified token contracts. Unknown descriptions fail closed.
 * Calculations are list-price estimates, never a claim about actual charges. */
export function priceFromResponse(
  data: unknown,
  path: string,
  input: Record<string, unknown>,
  inputVideoSeconds?: number,
): PriceEstimate {
  const value = data as { usd?: unknown; pricing_description?: unknown } | null;
  if (
    value &&
    (typeof value.usd === "string" || typeof value.usd === "number") &&
    String(value.usd).trim() !== "" &&
    Number.isFinite(Number(value.usd)) &&
    Number(value.usd) >= 0
  )
    return {
      usd: Number(value.usd),
      kind: "account",
      description:
        "Authenticated provider estimate. Final billing is determined by Higgsfield.",
    };
  const description =
    typeof value?.pricing_description === "string"
      ? value.pricing_description.slice(0, 4000)
      : "The provider did not return a usable cost estimate.";
  const unavailable: PriceEstimate = {
    usd: null,
    kind: "unavailable",
    description,
  };
  // Source-video lengths are not available in the plane. Never guess their cost.
  const hasVideo = Boolean(
    input.video_url ||
    (Array.isArray(input.video_urls) && input.video_urls.length),
  );
  if (hasVideo && (!Number.isFinite(inputVideoSeconds) || !inputVideoSeconds))
    return unavailable;
  const tier = String(input.resolution ?? "720p");
  if (
    path === "higgsfield/genjutsu/motion-transfer/v1.0" &&
    hasVideo &&
    description.includes("$0.318 at 480p, $0.681 at 720p, $1.632 at 1080p") &&
    description.includes("rounded up to the nearest whole second")
  ) {
    const rate = (
      { "480p": 0.318, "720p": 0.681, "1080p": 1.632 } as Record<string, number>
    )[tier];
    return rate === undefined
      ? unavailable
      : {
          usd: Math.round(Math.ceil(inputVideoSeconds!) * rate * 1e6) / 1e6,
          kind: "calculated",
          description:
            "Calculated from the provider's input-video rate, rounded up to whole seconds, before discounts. Final billing is determined by Higgsfield.",
        };
  }
  if (
    path.startsWith("alibaba/wan-3.0/") &&
    description.includes("480p $0.05, 720p $0.10, or 1080p $0.20") &&
    Number(input.duration) > 0
  ) {
    const rate = (
      { "480p": 0.05, "720p": 0.1, "1080p": 0.2 } as Record<string, number>
    )[tier];
    return rate === undefined
      ? unavailable
      : {
          usd: Math.round(Number(input.duration) * rate * 1e6) / 1e6,
          kind: "calculated",
          description:
            "Calculated from the provider's per-second resolution rate, before discounts. Final billing is determined by Higgsfield.",
        };
  }
  const seconds = Number(input.duration) + (hasVideo ? inputVideoSeconds! : 0);
  const resolution = String(input.resolution ?? "720p");
  const base = (
    { "480p": 480, "720p": 720, "1080p": 1080, "4k": 2160 } as Record<
      string,
      number
    >
  )[resolution];
  const ratio = String(input.aspect_ratio ?? "16:9")
    .split(":")
    .map(Number);
  if (
    !base ||
    !Number.isFinite(seconds) ||
    seconds <= 0 ||
    !ratio[0] ||
    !ratio[1]
  )
    return unavailable;
  const short = base;
  const long = Math.ceil(
    (base * Math.max(ratio[0], ratio[1])) / Math.min(ratio[0], ratio[1]),
  );
  const width = ratio[0] >= ratio[1] ? long : short;
  const height = ratio[0] >= ratio[1] ? short : long;
  let rate: number | undefined;
  const tokenContract =
    description.includes("24") &&
    description.includes("1024") &&
    description.includes("1,000 video tokens");
  if (
    tokenContract &&
    path.startsWith("bytedance/seedance-2.0/") &&
    description.includes("480p/720p/1080p $0.014") &&
    description.includes("4K $0.008")
  ) {
    if (
      hasVideo &&
      (!description.includes("$0.0084") || !description.includes("$0.0048"))
    )
      return unavailable;
    rate = hasVideo
      ? resolution === "4k"
        ? 0.0048
        : 0.0084
      : resolution === "4k"
        ? 0.008
        : 0.014;
  }
  const reducedSeedance25 =
    tokenContract &&
    path.startsWith("bytedance/seedance-2.5/") &&
    hasVideo &&
    description.includes("$0.01284 at 480p or 720p") &&
    description.includes("$0.01404 at 1080p");
  if (reducedSeedance25) rate = resolution === "1080p" ? 0.01404 : 0.01284;
  else if (
    tokenContract &&
    path.startsWith("bytedance/seedance-2.5/") &&
    description.includes("$0.0214") &&
    description.includes("$0.0234")
  )
    rate = resolution === "1080p" ? 0.0234 : 0.0214;
  if (
    tokenContract &&
    path === "higgsfield/cinema-studio/4.0" &&
    description.includes("$0.0214 without video input")
  )
    rate = 0.0214;
  if (
    hasVideo &&
    rate !== undefined &&
    !path.startsWith("bytedance/seedance-2.0/") &&
    !reducedSeedance25
  ) {
    if (!description.includes("0.6")) return unavailable;
    rate *= 0.6;
  }
  if (rate === undefined) return unavailable;
  const tokens = Math.ceil((seconds * width * height * 24) / 1024);
  return {
    usd: Math.round(((tokens * rate) / 1000) * 1e6) / 1e6,
    kind: "calculated",
    dimensions: `${width} × ${height}`,
    description: `Calculated from the provider's token formula at ${width} × ${height}, 24 fps, before discounts. Actual output dimensions and final provider billing may differ.`,
  };
}
