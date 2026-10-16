"use client";

import { useRef, useState } from "react";
import { useStoryboard } from "@/generation/stores/storyboard";
import { cutOf } from "@/film/types";
import { FilmProjectDialog } from "./film-project-dialog";

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
  const [dialog, setDialog] = useState<{
    id: string;
    mode: "rename" | "delete";
  } | null>(null);
  const dialogProject = board.projects.find(
    (project) => project.id === dialog?.id,
  );
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
          <h1>Your film projects.</h1>
          <p>Create a film, generate its clips, and assemble the final cut.</p>
        </div>
        <button
          className="ux-primary"
          disabled={board.generating}
          onClick={() => act(() => onOpen(board.createProject()))}
        >
          + New film
        </button>
      </div>
      {board.deletedProject && (
        <div className="project-deleted-notice" role="status">
          <span>“{board.deletedProject.title}” deleted.</span>
          <button onClick={() => act(board.restoreDeletedProject)}>
            Undo project deletion
          </button>
          <button
            aria-label="Dismiss project deletion"
            onClick={board.dismissDeletedProject}
          >
            ×
          </button>
        </div>
      )}
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
                    {project.shots.length
                      ? `${complete.length}/${project.shots.length} ready`
                      : "New project"}
                  </span>
                </div>
                <h3>{project.title}</h3>
                <p>
                  {project.shots.length
                    ? complete.length
                      ? `${project.shots.length} clips · ${seconds.toFixed(1)}s ready`
                      : `${project.shots.length} clips planned`
                    : "Ready to write your scenes"}
                </p>
              </button>
              <div className="project-card-actions">
                <button
                  disabled={board.generating || board.editingBusy}
                  aria-label={`Rename film ${project.title}`}
                  onClick={() => setDialog({ id: project.id, mode: "rename" })}
                >
                  Rename
                </button>
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
                <button
                  className="project-delete"
                  disabled={board.generating || board.editingBusy}
                  aria-label={`Delete film ${project.title}`}
                  onClick={() => setDialog({ id: project.id, mode: "delete" })}
                >
                  Delete
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
              : archived
                ? "Archived projects appear here."
                : "Choose New film to write your scenes. Already have a project? Import its backup."}
          </p>
        </div>
      )}
      {dialog && dialogProject && (
        <FilmProjectDialog
          project={dialogProject}
          mode={dialog.mode}
          onClose={() => setDialog(null)}
        />
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
