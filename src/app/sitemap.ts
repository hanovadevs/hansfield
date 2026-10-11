import type { MetadataRoute } from "next";

import { SITE_URL } from "@/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return ["/", "/help", "/privacy"].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.5,
  }));
}
