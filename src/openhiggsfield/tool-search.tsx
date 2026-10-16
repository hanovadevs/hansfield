"use client";
import { useEffect, useRef, useState } from "react";
export type ToolAction = { name: string; detail: string; run: () => void };
export function ToolSearch({
  actions,
  onClose,
}: {
  actions: ToolAction[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const matches = actions.filter((action) =>
    `${action.name} ${action.detail}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  function choose(i: number) {
    const action = matches[i];
    if (action) {
      onClose();
      action.run();
    }
  }
  return (
    <dialog
      ref={ref}
      className="tool-search"
      aria-label="Search tools"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="tool-search-head">
        <span>⌕</span>
        <input
          autoFocus
          aria-label="Find a tool"
          placeholder="What would you like to do?"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setIndex((i) => Math.min(i + 1, matches.length - 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setIndex((i) => Math.max(0, i - 1));
            }
            if (event.key === "Enter") {
              event.preventDefault();
              choose(index);
            }
          }}
        />
        <button onClick={onClose}>Esc</button>
      </div>
      <div className="tool-search-results">
        {matches.map((action, i) => (
          <button
            key={action.name}
            className={i === index ? "is-active" : ""}
            onClick={() => choose(i)}
          >
            <strong>{action.name}</strong>
            <span>{action.detail}</span>
            <b aria-hidden>↗</b>
          </button>
        ))}
        {!matches.length && (
          <p>No matching tools. Try “film”, “cost” or “library”.</p>
        )}
      </div>
      <footer>
        ↑ ↓ to browse <span>↵ to open</span>
      </footer>
    </dialog>
  );
}
