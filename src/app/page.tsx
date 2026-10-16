import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { OpenHiggsfieldApp } from "@/openhiggsfield/openhiggsfield-app";
import { hasPlatformCredentials } from "@/generation/actions";

import "@/openhiggsfield/openhiggsfield.css";
import "@/openhiggsfield/studio.css";
import "@/openhiggsfield/film.css";
import "@/openhiggsfield/experience.css";
import "@/openhiggsfield/team-workspace.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-ohf-inter",
  display: "swap",
});

/* Title, description and the Open Graph block all come from the root, which
   already describes this surface. Only the canonical link is route-specific. */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function OpenHiggsfieldPage() {
  const keyConfigured = await hasPlatformCredentials();
  return (
    <OpenHiggsfieldApp
      fontClassName={inter.variable}
      initialKeyConfigured={keyConfigured}
    />
  );
}
