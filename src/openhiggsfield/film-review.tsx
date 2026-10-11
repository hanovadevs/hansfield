"use client";
import { useRef, useState } from "react";
import { cutOf, type FilmShot } from "@/film/types";

export function FilmReview({ shots }: { shots: FilmShot[] }) {
  const clips = shots.filter((s) => s.clip);
  const [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(false),
    [time, setTime] = useState(0),
    [error, setError] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const desiredTime = useRef<number | null>(null);
  const shot = clips[index] ?? clips[0];
  const cut = shot ? cutOf(shot)! : null;
  const lengths = clips.map((s) => {
    const c = cutOf(s)!;
    return c.end - c.start;
  });
  const total = lengths.reduce((a, b) => a + b, 0),
    before = lengths.slice(0, index).reduce((a, b) => a + b, 0);
  function next() {
    if (index < clips.length - 1) {
      desiredTime.current = null;
      setIndex(index + 1);
      setTime(0);
    } else {
      setPlaying(false);
      video.current?.pause();
    }
  }
  function jump(nextIndex: number, offset = 0) {
    setTime(offset);
    desiredTime.current = cutOf(clips[nextIndex]!)!.start + offset;
    if (nextIndex === index && video.current)
      video.current.currentTime = desiredTime.current;
    else setIndex(nextIndex);
  }
  if (!shot || !cut)
    return (
      <div className="review-empty">
        <span aria-hidden>▷</span>
        <h2>A film you can watch.</h2>
        <p>Generate a shot or add footage to preview your sequence.</p>
      </div>
    );
  return (
    <section className="film-review" aria-label="Sequence review">
      <div className="review-monitor">
        <div className="review-monitor-bar">
          <span>SEQUENCE PREVIEW</span>
          <span>
            {index + 1} / {clips.length}
          </span>
        </div>
        <video
          key={`${shot.id}-${index}`}
          ref={video}
          aria-label="Film sequence preview"
          src={cut.url}
          playsInline
          muted={shot.muted}
          controls
          preload="metadata"
          onError={() => {
            setPlaying(false);
            setError(
              "This clip could not be loaded. Upload a saved copy to replace it.",
            );
          }}
          onLoadedMetadata={(e) => {
            e.currentTarget.currentTime = desiredTime.current ?? cut.start;
            if (playing)
              void e.currentTarget.play().catch(() => setPlaying(false));
          }}
          onPlay={(e) => {
            setPlaying(true);
            if (
              e.currentTarget.currentTime < cut.start ||
              e.currentTarget.currentTime >= cut.end
            )
              e.currentTarget.currentTime = cut.start;
          }}
          onPause={(e) => {
            if (e.currentTarget.currentTime < cut.end - 0.05) setPlaying(false);
          }}
          onEnded={next}
          onTimeUpdate={(e) => {
            setTime(Math.max(0, e.currentTarget.currentTime - cut.start));
            if (
              !e.currentTarget.paused &&
              e.currentTarget.currentTime >= cut.end - 0.02
            ) {
              e.currentTarget.pause();
              next();
            }
          }}
        />
        <div className="review-controls">
          <button
            onClick={() => {
              setError("");
              if (playing) {
                video.current?.pause();
                setPlaying(false);
              } else {
                if (
                  index === clips.length - 1 &&
                  (video.current?.currentTime ?? 0) >= cut.end - 0.05
                )
                  jump(0);
                setPlaying(true);
                void video.current?.play().catch(() => setPlaying(false));
              }
            }}
            aria-label={playing ? "Pause sequence" : "Play sequence"}
          >
            {playing ? "Ⅱ" : "▷"}
          </button>
          <span>{Math.min(total, before + time).toFixed(1)}s</span>
          <input
            aria-label="Sequence playhead"
            type="range"
            min={0}
            max={total}
            step={0.05}
            value={Math.min(total, before + time)}
            onChange={(e) => {
              let offset = Number(e.target.value),
                found = 0;
              while (found < clips.length - 1 && offset >= lengths[found]!)
                offset -= lengths[found++]!;
              jump(found, offset);
            }}
          />
          <span>{total.toFixed(1)}s</span>
        </div>
      </div>
      <div className="review-chapters">
        {clips.map((s, i) => (
          <button key={s.id} aria-pressed={i === index} onClick={() => jump(i)}>
            <span>{String(i + 1).padStart(2, "0")}</span>
            <strong>{s.title}</strong>
            <small>{lengths[i]!.toFixed(1)}s</small>
          </button>
        ))}
      </div>
      {shots.length > clips.length && (
        <p className="film-hint">
          {shots.length - clips.length} unrendered shots are excluded from this
          preview.
        </p>
      )}
      <p className="film-hint">
        Preview uses clean cuts. Export applies your chosen transitions.
      </p>
      {error && (
        <p role="alert" className="film-shot-error">
          {error}
        </p>
      )}
    </section>
  );
}
