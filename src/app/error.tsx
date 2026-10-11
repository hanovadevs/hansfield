"use client";
import { useEffect } from "react";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Jenera workspace error", error.digest || error.name);
  }, [error]);
  return (
    <main
      style={{
        padding: "64px 24px",
        maxWidth: 640,
        margin: "0 auto",
        fontFamily: "Arial,sans-serif",
        color: "#233c32",
      }}
    >
      <h1>The workspace could not open.</h1>
      <p>
        Your saved projects remain in this browser. Try opening the workspace
        again.
      </p>
      <button type="button" onClick={retry}>
        Try again
      </button>{" "}
      <a href="/help">Get help</a>
    </main>
  );
}
