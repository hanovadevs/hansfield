"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { VIEWS, VIEW_LABELS, type GalleryView } from "./data";

export function Topbar({
  view,
  onView,
  busy,
  keyConfigured,
  onKeys,
}: {
  view: GalleryView;
  onView: (next: GalleryView) => void;
  busy: boolean;
  keyConfigured: boolean;
  onKeys: () => void;
}) {
  const tabsRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);

  useEffect(() => {
    const tabs = tabsRef.current;
    if (!tabs) return;
    let live = true;
    const measure = () => {
      const active = tabs.querySelector<HTMLElement>('[aria-selected="true"]');
      if (live && active) setThumb({ x: active.offsetLeft, w: active.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(tabs);
    void document.fonts.ready.then(measure);
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [view]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const from = VIEWS.indexOf(view);
      const to =
        event.key === "ArrowRight"
          ? (from + 1) % VIEWS.length
          : event.key === "ArrowLeft"
            ? (from - 1 + VIEWS.length) % VIEWS.length
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? VIEWS.length - 1
                : -1;
      if (to < 0) return;
      event.preventDefault();
      onView(VIEWS[to]!);
      tabsRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')[to]?.focus();
    },
    [onView, view],
  );

  return (
    <div className="ohf-topbar">
      <h1 className="ohf-sr">Hansfield</h1>

      <div className="ohf-bar ohf-enter-1">
        <div
          className="ohf-tabs"
          role="tablist"
          aria-label="Scope"
          ref={tabsRef}
          onKeyDown={onKeyDown}
        >
          <span
            className="ohf-thumb"
            data-ready={thumb !== null}
            aria-hidden
            style={
              {
                "--thumb-x": `${thumb?.x ?? 0}px`,
                "--thumb-w": `${thumb?.w ?? 0}px`,
              } as React.CSSProperties
            }
          />
          {VIEWS.map((id) => {
            const selected = view === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                id={`ohf-tab-${id}`}
                aria-selected={selected}
                aria-controls="ohf-panel"
                tabIndex={selected ? 0 : -1}
                className="ohf-tab"
                data-view={id}
                aria-label={VIEW_LABELS[id]}
                onClick={() => onView(id)}
              >
                <span className="ohf-tab-label">{VIEW_LABELS[id]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="ohf-bar ohf-enter-1">
        <button
          type="button"
          className="ohf-key"
          data-busy={busy}
          data-ready={keyConfigured}
          onClick={onKeys}
          aria-label={keyConfigured ? "API Key Configured" : "Add API Key"}
        >
          <span className="ohf-lamp" />
          <span className="ohf-key-text">{keyConfigured ? "Key Active" : "Add Key"}</span>
        </button>
      </div>
    </div>
  );
}
