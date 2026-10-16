import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GenerationPlane } from "../catalog";
import { validatePlane } from "../validate";
import { browserStorage } from "./browser-storage";
import { useActive } from "./active";
import { useImageMedia, useVideoMedia } from "./media";
import { useImagePrompt, useVideoPrompt } from "./prompt";
import { useSettings } from "./settings";
import { getModel } from "../catalog";

import type { FilmShot, Clip } from "@/film/types";
import { cutOf } from "@/film/types";
export type Shot = FilmShot;
export type FilmProject = {
  id: string;
  title: string;
  notes: string;
  story?: string;
  shots: Shot[];
  createdAt: number;
  updatedAt: number;
  archived?: boolean;
};
type Snapshot = Pick<FilmProject, "title" | "notes" | "shots" | "story">;
type Board = {
  projects: FilmProject[];
  activeProjectId: string | null;
  undoStack: Snapshot[];
  redoStack: Snapshot[];
  createProject: (title?: string) => string;
  openProject: (id: string) => void;
  duplicateProject: (id: string) => string;
  archiveProject: (id: string, archived: boolean) => void;
  renameProject: (id: string, title: string) => void;
  deleteProject: (id: string) => void;
  deletedProject: FilmProject | null;
  restoreDeletedProject: () => void;
  dismissDeletedProject: () => void;
  undo: () => void;
  redo: () => void;
  title: string;
  shots: Shot[];
  notes: string;
  story: string;
  setStory: (story: string) => void;
  generating: boolean;
  editingBusy: boolean;
  setEditingBusy: (busy: boolean) => void;
  stopRequested: boolean;
  setTitle: (title: string) => void;
  add: (plane: GenerationPlane) => void;
  append: (shots: Shot[]) => void;
  patch: (id: string, patch: Partial<Shot>) => void;
  setNotes: (notes: string) => void;
  setGenerating: (generating: boolean) => void;
  stop: () => void;
  split: (id: string, time: number) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  move: (id: string, delta: number) => void;
  importBoard: (data: unknown) => void;
};
export const useStoryboard = create<Board>()(
  persist(
    (rawSet, get) => {
      const set = (
        update: Partial<Board> | ((state: Board) => Partial<Board>),
        remember = true,
      ) =>
        rawSet((state) => {
          const changes = typeof update === "function" ? update(state) : update;
          if (!(
            "title" in changes ||
            "shots" in changes ||
            "notes" in changes ||
            "story" in changes
          ))
            return changes;
          const id = state.activeProjectId ?? crypto.randomUUID();
          const old = state.projects.find((p) => p.id === id);
          const project = {
            id,
            createdAt: old?.createdAt ?? Date.now(),
            ...old,
            title: changes.title ?? state.title,
            notes: changes.notes ?? state.notes,
            story: changes.story ?? state.story,
            shots: changes.shots ?? state.shots,
            updatedAt: Date.now(),
          };
          return {
            ...changes,
            activeProjectId: id,
            projects: [...state.projects.filter((p) => p.id !== id), project],
            ...(remember
              ? {
                  undoStack: [
                    ...state.undoStack.slice(-29),
                    structuredClone({
                      title: state.title,
                      notes: state.notes,
                      story: state.story,
                      shots: state.shots,
                    }),
                  ],
                  redoStack: [],
                }
              : {}),
          };
        });
      const available = () => {
        if (get().generating || get().editingBusy)
          throw new Error(
            "Wait for the current operation before changing projects.",
          );
      };
      return {
        projects: [],
        activeProjectId: null,
        undoStack: [],
        redoStack: [],
        deletedProject: null,
        createProject: (title = "Untitled film") => {
          available();
          const project: FilmProject = {
            id: crypto.randomUUID(),
            title,
            notes: "",
            story: "",
            shots: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          rawSet((state) => ({
            projects: [...state.projects, project],
            activeProjectId: project.id,
            title,
            notes: "",
            story: "",
            shots: [],
            undoStack: [],
            redoStack: [],
          }));
          return project.id;
        },
        openProject: (id) => {
          available();
          const project = get().projects.find((p) => p.id === id);
          if (!project)
            throw new Error("This film project is not saved in this browser.");
          rawSet({
            activeProjectId: id,
            title: project.title,
            notes: project.notes,
            story: project.story ?? "",
            shots: project.shots,
            undoStack: [],
            redoStack: [],
          });
        },
        duplicateProject: (id) => {
          available();
          const source = get().projects.find((p) => p.id === id);
          if (!source) throw new Error("Film project not found.");
          const project = {
            ...structuredClone(source),
            id: crypto.randomUUID(),
            title: `${source.title} · alternate cut`,
            archived: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            shots: source.shots.map(({ job, ...shot }) => ({
              ...structuredClone(shot),
              id: crypto.randomUUID(),
            })),
          };
          rawSet((state) => ({ projects: [...state.projects, project] }));
          return project.id;
        },
        archiveProject: (id, archived) => {
          available();
          rawSet((state) => ({
            projects: state.projects.map((p) =>
              p.id === id ? { ...p, archived } : p,
            ),
          }));
        },
        renameProject: (id, title) => {
          available();
          const name = title.trim();
          if (!name || name.length > 120)
            throw new Error(
              "Enter a project name between 1 and 120 characters.",
            );
          if (!get().projects.some((project) => project.id === id))
            throw new Error("Film project not found.");
          if (get().activeProjectId === id) set({ title: name });
          else
            rawSet((state) => ({
              projects: state.projects.map((project) =>
                project.id === id
                  ? { ...project, title: name, updatedAt: Date.now() }
                  : project,
              ),
            }));
        },
        deleteProject: (id) => {
          available();
          const project = get().projects.find((project) => project.id === id);
          if (!project) throw new Error("Film project not found.");
          if (
            project.shots.some(
              (shot) => shot.job && shot.job.phase !== "failed",
            )
          )
            throw new Error(
              "Finish, cancel or resume pending clips before deleting this project.",
            );
          rawSet((state) => ({
            projects: state.projects.filter((project) => project.id !== id),
            deletedProject: structuredClone(project),
            ...(state.activeProjectId === id
              ? {
                  activeProjectId: null,
                  title: "Untitled film",
                  notes: "",
                  story: "",
                  shots: [],
                  undoStack: [],
                  redoStack: [],
                }
              : {}),
          }));
        },
        restoreDeletedProject: () => {
          available();
          const project = get().deletedProject;
          if (!project) return;
          rawSet((state) => ({
            projects: [
              ...state.projects.filter((item) => item.id !== project.id),
              { ...project, updatedAt: Date.now() },
            ],
            deletedProject: null,
          }));
        },
        dismissDeletedProject: () => rawSet({ deletedProject: null }),
        undo: () => {
          if (get().generating || !get().undoStack.length) return;
          const state = get(),
            previous = state.undoStack[state.undoStack.length - 1]!;
          set(
            {
              ...structuredClone(previous),
              undoStack: state.undoStack.slice(0, -1),
              redoStack: [
                ...state.redoStack,
                structuredClone({
                  title: state.title,
                  notes: state.notes,
                  story: state.story,
                  shots: state.shots,
                }),
              ],
            },
            false,
          );
        },
        redo: () => {
          if (get().generating || !get().redoStack.length) return;
          const state = get(),
            next = state.redoStack[state.redoStack.length - 1]!;
          set(
            {
              ...structuredClone(next),
              redoStack: state.redoStack.slice(0, -1),
              undoStack: [
                ...state.undoStack,
                structuredClone({
                  title: state.title,
                  notes: state.notes,
                  story: state.story,
                  shots: state.shots,
                }),
              ],
            },
            false,
          );
        },
        title: "Untitled film",
        shots: [],
        notes: "",
        story: "",
        setStory: (story) => set({ story: story.slice(0, 20000) }),
        generating: false,
        editingBusy: false,
        setEditingBusy: (editingBusy) => rawSet({ editingBusy }),
        stopRequested: false,
        setTitle: (title) => set({ title }),
        setNotes: (notes) => set({ notes: notes.slice(0, 4000) }),
        setGenerating: (generating) =>
          set({
            generating,
            stopRequested: false,
            ...(generating ? { undoStack: [], redoStack: [] } : {}),
          }),
        stop: () => set({ stopRequested: true }),
        patch: (id, patch) =>
          set(
            (state) => ({
              shots: state.shots.map((shot) =>
                shot.id === id ? { ...shot, ...patch } : shot,
              ),
            }),
            !("job" in patch || "clip" in patch),
          ),
        append: (shots) =>
          set((state) => {
            if (state.shots.length + shots.length > 40)
              throw new Error("A film can have up to 40 shots.");
            return { shots: [...state.shots, ...shots] };
          }),
        split: (id, time) =>
          set((state) => {
            const index = state.shots.findIndex((shot) => shot.id === id);
            const shot = state.shots[index];
            if (!shot) throw new Error("Shot not found.");
            const cut = cutOf(shot);
            if (
              !cut ||
              !Number.isFinite(time) ||
              time - cut.start < 0.1 ||
              cut.end - time < 0.1
            )
              throw new Error(
                "Place the playhead inside the kept clip, at least 0.1 seconds from either cut.",
              );
            if (state.shots.length >= 40)
              throw new Error("A film can have up to 40 shots.");
            const shots = [...state.shots];
            shots.splice(
              index,
              1,
              { ...shot, trimEnd: time },
              {
                ...structuredClone(shot),
                id: crypto.randomUUID(),
                title: `${shot.title} · part 2`,
                trimStart: time,
                trimEnd: cut.end,
                continuity: "none",
                sourceSignature: undefined,
                job: undefined,
                inputSignature: undefined,
              },
            );
            return { shots };
          }),
        duplicate: (id) =>
          set((state) => {
            const index = state.shots.findIndex((shot) => shot.id === id);
            if (index < 0) return state;
            if (state.shots.length >= 40)
              throw new Error("A film can have up to 40 shots.");
            const shots = [...state.shots];
            shots.splice(index + 1, 0, {
              ...structuredClone(shots[index]!),
              id: crypto.randomUUID(),
              continuity: "none",
              sourceSignature: undefined,
              inputSignature: undefined,
              job: undefined,
            });
            return { shots };
          }),
        add: (plane) =>
          set((state) => {
            if (state.shots.length >= 40)
              throw new Error("A film can have up to 40 shots.");
            return {
              shots: [
                ...state.shots,
                {
                  id: crypto.randomUUID(),
                  title: plane.prompt.text.slice(0, 60),
                  plane: structuredClone(plane),
                },
              ],
            };
          }),
        remove: (id) =>
          set((state) => ({
            shots: state.shots.filter((shot) => shot.id !== id),
          })),
        move: (id, delta) =>
          set((state) => {
            const shots = [...state.shots];
            const index = shots.findIndex((shot) => shot.id === id);
            const target = index + delta;
            if (index < 0 || target < 0 || target >= shots.length) return state;
            [shots[index], shots[target]] = [shots[target]!, shots[index]!];
            return { shots };
          }),
        importBoard: (data) => {
          if (!data || typeof data !== "object")
            throw new Error("Invalid shot board file.");
          const board = data as {
            version?: unknown;
            title?: unknown;
            shots?: unknown;
          };
          if (
            (board.version !== 1 && board.version !== 2) ||
            typeof board.title !== "string" ||
            !Array.isArray(board.shots) ||
            board.shots.length > 40
          )
            throw new Error(
              "Choose a Hansfield shot board file (up to 40 shots).",
            );
          const shots = board.shots.map((value) => {
            if (!value || typeof value !== "object")
              throw new Error("Invalid shot in board.");
            const shot = value as Shot;
            const plane = validatePlane(shot.plane);
            const next: Shot = {
              id: crypto.randomUUID(),
              title:
                typeof shot.title === "string"
                  ? shot.title.slice(0, 60)
                  : plane.prompt.text.slice(0, 60),
              plane,
              continuity: ["none", "frame", "video"].includes(
                shot.continuity ?? "none",
              )
                ? shot.continuity
                : "none",
            };
            if (shot.clip) {
              const clip = shot.clip as Clip;
              const url = new URL(clip.url);
              if (
                !/^https?:$/.test(url.protocol) ||
                typeof clip.duration !== "number" ||
                !Number.isFinite(clip.duration) ||
                clip.duration <= 0 ||
                clip.duration > 600 ||
                !Number.isFinite(clip.width) ||
                !Number.isFinite(clip.height) ||
                clip.width <= 0 ||
                clip.height <= 0 ||
                clip.width > 8192 ||
                clip.height > 8192
              )
                throw new Error("Invalid clip in board.");
              next.clip = {
                url: clip.url,
                duration: clip.duration,
                width: clip.width,
                height: clip.height,
                hasAudio: clip.hasAudio === true,
              };
              next.trimStart = shot.trimStart;
              next.trimEnd = shot.trimEnd;
              next.muted = shot.muted === true;
              next.sourceSignature =
                typeof shot.sourceSignature === "string"
                  ? shot.sourceSignature
                  : undefined;
              next.inputSignature =
                typeof shot.inputSignature === "string"
                  ? shot.inputSignature
                  : undefined;
              next.clipRevision =
                typeof shot.clipRevision === "string"
                  ? shot.clipRevision.slice(0, 200)
                  : undefined;
              cutOf(next);
            }
            return next;
          });
          set({
            title: board.title.slice(0, 120),
            shots,
            notes:
              typeof (data as { notes?: unknown }).notes === "string"
                ? String((data as { notes: string }).notes).slice(0, 4000)
                : "",
            story:
              typeof (data as { story?: unknown }).story === "string"
                ? String((data as { story: string }).story).slice(0, 20000)
                : shots
                    .map((s) => s.plane.prompt.text.split("\n")[0])
                    .join("\n"),
          });
        },
      };
    },
    {
      name: "hansfield.storyboard.v1",
      storage: browserStorage(),
      partialize: ({
        title,
        shots,
        notes,
        story,
        projects,
        activeProjectId,
      }) => ({
        title,
        shots,
        notes,
        story,
        projects,
        activeProjectId,
      }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<Board> | undefined;
        if (!saved) return current;
        const projects = Array.isArray(saved.projects)
          ? saved.projects
          : saved.shots?.length
            ? [
                {
                  id: crypto.randomUUID(),
                  title: saved.title || "Untitled film",
                  notes: saved.notes || "",
                  shots: saved.shots,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                },
              ]
            : [];
        const active =
          projects.find((p) => p.id === saved.activeProjectId) ?? projects[0];
        return {
          ...current,
          projects,
          activeProjectId: active?.id ?? null,
          title: active?.title ?? current.title,
          notes: active?.notes ?? "",
          story: active?.story ?? "",
          shots: active?.shots ?? [],
        };
      },
    },
  ),
);

export function restorePlane(plane: GenerationPlane) {
  const model = getModel(plane.model);
  useActive.getState().setModel(model.id);
  useSettings.getState().set(model.id, plane.settings);
  (model.surface === "image" ? useImagePrompt : useVideoPrompt)
    .getState()
    .setText(plane.prompt.text);
  (model.surface === "image" ? useImageMedia : useVideoMedia)
    .getState()
    .replace(Object.values(plane.media).flat());
}
