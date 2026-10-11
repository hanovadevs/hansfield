"use client";

import { useRef, useState } from "react";
import { useStoryboard } from "@/generation/stores/storyboard";
import { cutOf } from "@/film/types";
import { planShots } from "@/film/plan";

const STARTERS = [
  {
    name: "A small adventure",
    tag: "Narrative",
    color: "sage",
    story:
      "A traveler finds a hidden trail in a misty forest.\nShe follows a warm light between the trees.\nThe trail opens onto a moonlit lake.",
  },
  {
    name: "Something worth a closer look",
    tag: "Product",
    color: "clay",
    story:
      "A ceramic perfume bottle stands on a stone pedestal in soft morning light.\nThe camera approaches its sculpted surface as a ribbon of light moves across it.\nA slow orbit reveals the complete bottle against a clean backdrop.",
  },
  {
    name: "A place, a feeling",
    tag: "Travel",
    color: "sand",
    story:
      "The sun rises over a quiet coastal village.\nThe camera follows the same narrow street toward the sea.\nThe street opens onto a golden beach as the tide rolls in.",
  },
];

export function FilmProjects({
  onOpen,
  onError,
}: {
  onOpen: (id: string) => void;
  onError: (message: string | null) => void;
}) {
  const board = useStoryboard();
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const projects = board.projects
    .filter(
      (p) =>
        !!p.archived === archived &&
        p.title.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const act = (action: () => void) => {
    try {
      action();
      onError(null);
    } catch (error) {
      onError((error as Error).message);
    }
  };
  return (
    <section className="film-projects" aria-label="Film projects">
      <div className="project-heading">
        <div>
          <span className="studio-eyebrow">YOUR FILMS</span>
          <h1>
            Give your story <em>room.</em>
          </h1>
          <p>One project. Every shot. Your final cut.</p>
        </div>
        <button
          className="ux-primary"
          disabled={board.generating}
          onClick={() => act(() => onOpen(board.createProject()))}
        >
          + New film
        </button>
      </div>
      <div className="project-start-heading">
        <h2>Start with a direction</h2>
        <span>Editable shot plans</span>
      </div>
      <div className="project-starters">
        {STARTERS.map((starter, i) => (
          <button
            key={starter.name}
            className={`project-starter ${starter.color}`}
            disabled={board.generating}
            onClick={() =>
              act(() => {
                const id = board.createProject(starter.name);
                board.setStory(starter.story);
                board.append(
                  planShots(starter.story, "seedance-2.5", 15, 5, "frame"),
                );
                onOpen(id);
              })
            }
          >
            <span className="starter-art" aria-hidden>
              <i />
              <b />
              <small>0{i + 1}</small>
            </span>
            <span>{starter.tag}</span>
            <strong>{starter.name}</strong>
            <span className="starter-go" aria-hidden>
              ↗
            </span>
          </button>
        ))}
      </div>
      <div className="project-list-heading">
        <div>
          <h2>{archived ? "Archived films" : "Your projects"}</h2>
          <span>Saved on this device</span>
        </div>
        <div className="project-list-actions">
          <input
            aria-label="Search film projects"
            placeholder="Find a film…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            aria-pressed={archived}
            onClick={() => setArchived(!archived)}
          >
            {archived ? "Active films" : "Archived"}
          </button>
          <button
            disabled={board.generating}
            onClick={() => input.current?.click()}
          >
            Import project
          </button>
        </div>
      </div>
      <div className="project-grid">
        {projects.map((project) => {
          const complete = project.shots.filter((s) => s.clip);
          const seconds = complete.reduce((n, shot) => {
            const cut = cutOf(shot)!;
            return n + cut.end - cut.start;
          }, 0);
          return (
            <article className="project-card" key={project.id}>
              <button
                className="project-open"
                disabled={board.generating}
                onClick={() => onOpen(project.id)}
                aria-label={`Open film ${project.title}`}
              >
                <div className="project-cover">
                  {complete[0]?.clip ? (
                    <video
                      src={complete[0].clip.url}
                      muted
                      playsInline
                      preload="metadata"
                      onLoadedMetadata={(e) => {
                        const cut = cutOf(complete[0]!)!;
                        e.currentTarget.currentTime =
                          cut.start + Math.min(0.01, (cut.end - cut.start) / 2);
                      }}
                    />
                  ) : (
                    <span aria-hidden className="project-empty-cover">
                      {project.title.slice(0, 1).toUpperCase()}
                      <i />
                    </span>
                  )}
                  <span>
                    {complete.length}/{project.shots.length} ready
                  </span>
                </div>
                <h3>{project.title}</h3>
                <p>
                  {project.shots.length} shots · {seconds.toFixed(1)}s kept
                </p>
              </button>
              <div className="project-card-actions">
                <button
                  disabled={board.generating}
                  onClick={() =>
                    act(() => onOpen(board.duplicateProject(project.id)))
                  }
                  aria-label={`Duplicate film ${project.title}`}
                >
                  Alternate cut
                </button>
                <button
                  disabled={board.generating}
                  onClick={() =>
                    act(() =>
                      board.archiveProject(project.id, !project.archived),
                    )
                  }
                >
                  {project.archived ? "Restore" : "Archive"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {!projects.length && (
        <div className="project-empty">
          <span aria-hidden>＋</span>
          <h3>
            {search
              ? "No matching films"
              : archived
                ? "No archived films"
                : "Your first film starts here"}
          </h3>
          <p>
            {search
              ? "Try a different title."
              : "Create a project or choose a starting direction."}
          </p>
        </div>
      )}
      <input
        hidden
        ref={input}
        type="file"
        accept=".json"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (file.size > 1024 * 1024) {
            onError("Choose a project smaller than 1 MB.");
            return;
          }
          void file
            .text()
            .then((text) => {
              const data = JSON.parse(text);
              // Validate in the current store before creating a new project, retaining the previous project on error.
              const state = useStoryboard.getState();
              const prior = {
                title: state.title,
                notes: state.notes,
                story: state.story,
                shots: state.shots,
                projects: state.projects,
                activeProjectId: state.activeProjectId,
                undoStack: state.undoStack,
                redoStack: state.redoStack,
              };
              try {
                if (state.generating)
                  throw new Error("Wait for the current sequence to finish.");
                state.createProject();
                state.importBoard(data);
                onOpen(useStoryboard.getState().activeProjectId!);
                onError(null);
              } catch (error) {
                useStoryboard.setState(prior);
                throw error;
              }
            })
            .catch((error) => onError((error as Error).message));
        }}
      />
    </section>
  );
}
