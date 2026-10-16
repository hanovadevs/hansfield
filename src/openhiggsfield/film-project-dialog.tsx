"use client";
import { useEffect, useRef, useState } from "react";
import {
  useStoryboard,
  type FilmProject,
} from "@/generation/stores/storyboard";

export function FilmProjectDialog({
  project,
  mode,
  onClose,
  onDeleted,
}: {
  project: FilmProject;
  mode: "rename" | "delete";
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(project.title);
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    if (mode === "rename") input.current?.select();
  }, [mode]);
  return (
    <dialog
      ref={dialog}
      className="film-project-dialog"
      aria-labelledby="project-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const state = useStoryboard.getState();
            if (mode === "rename") state.renameProject(project.id, name);
            else state.deleteProject(project.id);
            onClose();
            if (mode === "delete") onDeleted?.();
          } catch (error) {
            setError((error as Error).message);
          }
        }}
      >
        <span className="workspace-eyebrow">FILM PROJECT</span>
        <h2 id="project-dialog-title">
          {mode === "rename" ? "Rename project" : `Delete “${project.title}”?`}
        </h2>
        {mode === "rename" ? (
          <label>
            Project name
            <input
              ref={input}
              aria-label="Project name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              required
              autoFocus
            />
          </label>
        ) : (
          <p>
            This removes its story, shot plan and edits from this browser. Your
            downloaded videos stay on your device. You can undo this until you
            leave or reload the app.
          </p>
        )}
        {error && (
          <p className="film-shot-error" role="alert">
            {error}
          </p>
        )}
        <div className="project-dialog-actions">
          <button type="button" onClick={onClose} autoFocus={mode === "delete"}>
            Cancel
          </button>
          <button
            type="submit"
            className={
              mode === "delete" ? "project-delete-confirm" : "ux-primary"
            }
            disabled={mode === "rename" && !name.trim()}
          >
            {mode === "rename" ? "Save name" : "Delete project"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
