import type { ReactNode } from "react";
import { BRAND_MARK, BRAND_NAME } from "@/brand";
import "./info.css";

export function InfoShell({ children }: { children: ReactNode }) {
  return (
    <main className="info-page">
      <nav className="info-nav" aria-label="Jenera information">
        <a className="info-brand" href="/">
          <img src={BRAND_MARK} alt="" width="44" height="44" />
          {BRAND_NAME}
        </a>
        <a href="/">Open studio →</a>
      </nav>
      {children}
      <footer className="info-footer">
        <a href="/help">Help</a>
        <a href="/privacy">Privacy</a>
        <span>Independent film studio</span>
      </footer>
    </main>
  );
}
