import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpeg from "ffmpeg-static";
import ffprobe from "ffprobe-static";
import { planShots, continuityPlane, durationFor } from "../src/film/plan";
import {
  cutOf,
  signatureOf,
  inputSignatureOf,
  shotsNeedingGeneration,
  isStale,
  type FilmShot,
} from "../src/film/types";
import {
  validateOperation,
  validateMediaUrl,
  processMedia,
} from "../src/film/server";
import { useStoryboard } from "../src/generation/stores/storyboard";
import { toPlatform } from "../src/generation/to-platform";
import { validatePlane } from "../src/generation/validate";

const run = promisify(execFile);
const fixtureUrl = "http://127.0.0.1:4319/media/video.mp4";
let server: http.Server;
let temp: string;
before(async () => {
  process.env.HANSFIELD_TEST_MODE = "1";
  const bytes = await readFile(
    new URL("./fixtures/preview.mp4", import.meta.url),
  );
  server = http.createServer((_req, res) => {
    res.setHeader("Content-Type", "video/mp4");
    res.end(bytes);
  });
  await new Promise<void>((resolve) =>
    server.listen(4319, "127.0.0.1", resolve),
  );
  temp = await mkdtemp(path.join(tmpdir(), "hansfield-test-"));
});
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (
    path.dirname(temp) === path.resolve(tmpdir()) &&
    path.basename(temp).startsWith("hansfield-test-")
  )
    await rm(temp, { recursive: true, force: true });
});

test("film planning produces sequential shots with legal model durations", () => {
  const shots = planShots(
    "A traveler enters a forest.\nShe reaches a moonlit lake.",
    "seedance-2.5",
    30,
    5,
    "frame",
  );
  assert.equal(shots.length, 6);
  assert.equal(shots[0]!.continuity, "none");
  assert.equal(shots[1]!.continuity, "frame");
  assert.ok(shots[5]!.plane.prompt.text.includes("natural ending"));
  assert.equal(durationFor("ltx-2.5-fast", 5), 6);
  assert.throws(
    () => planShots("Story", "cinema-4", 30, 5, "frame"),
    /opening frame/,
  );
  assert.throws(
    () => planShots("Story", "seedance-2.5", 600, 5, "frame"),
    /40 shots/,
  );
});

function readyShot(): FilmShot {
  const shot = planShots(
    "A traveler walks.",
    "seedance-2.5",
    10,
    5,
    "frame",
  )[0]!;
  return {
    ...shot,
    clip: {
      url: fixtureUrl,
      duration: 5,
      width: 640,
      height: 360,
      hasAudio: false,
    },
    trimStart: 1,
    trimEnd: 4,
  };
}
test("continuation carries the prior kept frame and common character notes into the image endpoint", () => {
  const previous = readyShot();
  const shot = planShots(
    "She turns toward the lake.",
    "seedance-2.5",
    10,
    5,
    "frame",
  )[1]!;
  const plane = continuityPlane(
    shot,
    "Same blue coat and braided hair.",
    previous,
    "https://cdn.example.com/last-frame.jpg",
  );
  const mapped = toPlatform(validatePlane(plane));
  assert.equal(mapped.path, "bytedance/seedance-2.5/image-to-video");
  assert.equal(mapped.body.image_url, "https://cdn.example.com/last-frame.jpg");
  assert.ok(plane.prompt.text.includes("Same blue coat"));
  assert.ok(plane.prompt.text.includes("without a reset"));
  assert.throws(
    () => continuityPlane(shot, "", undefined, "https://cdn.example.com/a.jpg"),
    /previous shot/,
  );
});
test("video reference continuation routes to the reference endpoint and preserves notes", () => {
  const shot = planShots("Continue the walk.", "cinema-4", 10, 5, "video")[1]!;
  const plane = continuityPlane(
    shot,
    "Same camera and light.",
    readyShot(),
    "https://cdn.example.com/previous.mp4",
  );
  assert.deepEqual(toPlatform(validatePlane(plane)).body.video_urls, [
    "https://cdn.example.com/previous.mp4",
  ]);
});
test("splitting keeps both cuts of the same source without losing footage", () => {
  const shot = readyShot();
  useStoryboard.setState({ shots: [shot] });
  useStoryboard.getState().split(shot.id, 2.5);
  const [left, right] = useStoryboard.getState().shots;
  assert.equal(cutOf(left!)!.start, 1);
  assert.equal(cutOf(left!)!.end, 2.5);
  assert.equal(cutOf(right!)!.start, 2.5);
  assert.equal(cutOf(right!)!.end, 4);
  assert.equal(left!.clip!.url, right!.clip!.url);
  assert.equal(right!.continuity, "none");
  assert.throws(
    () => useStoryboard.getState().split(left!.id, 1),
    /inside the kept clip/,
  );
});
test("trimming a prior shot marks an old connection for regeneration", () => {
  const previous = readyShot();
  const shot = {
    ...readyShot(),
    continuity: "frame" as const,
    sourceSignature: signatureOf(previous, "frame"),
  };
  assert.equal(isStale(shot, previous), false);
  assert.equal(isStale(shot, { ...previous, trimStart: 2 }), false);
  assert.equal(isStale(shot, { ...previous, trimEnd: 3 }), true);
  assert.throws(() => cutOf({ ...previous, trimEnd: 0.5 }), /at least 0.1/);
});
test("changed scene inputs regenerate the linked chain and stop at an independent shot", () => {
  const shots = Array.from({ length: 4 }, (_, i) => ({
    ...readyShot(),
    id: `shot-${i}`,
    continuity: i > 0 && i < 3 ? ("frame" as const) : ("none" as const),
  }));
  for (let i = 0; i < shots.length; i++) {
    shots[i]!.inputSignature = inputSignatureOf(shots[i]!, "Blue coat");
    if (i > 0) shots[i]!.sourceSignature = signatureOf(shots[i - 1]!, "frame");
  }
  assert.equal(shotsNeedingGeneration(shots, "Blue coat").length, 0);
  shots[0]!.plane = {
    ...shots[0]!.plane,
    prompt: { text: "A new opening action" },
  };
  assert.deepEqual(
    shotsNeedingGeneration(shots, "Blue coat").map((s) => s.id),
    ["shot-0", "shot-1", "shot-2"],
  );
  assert.equal(shotsNeedingGeneration(shots, "Red coat").length, 4);
});
test("board round-trip retains cuts and connections but strips active jobs", () => {
  const first = readyShot();
  const second = {
    ...readyShot(),
    continuity: "frame" as const,
    sourceSignature: signatureOf(first, "frame"),
    job: {
      phase: "queued" as const,
      idempotencyKey: "old-intent",
      requestId: "old-request",
      startedAt: 1,
    },
  };
  useStoryboard.getState().importBoard({
    version: 2,
    title: "Round trip",
    notes: "Blue coat",
    shots: [first, second],
  });
  const imported = useStoryboard.getState().shots;
  assert.equal(imported[1]!.job, undefined);
  assert.equal(imported[0]!.trimStart, 1);
  assert.equal(isStale(imported[1]!, imported[0]!), false);
  assert.notEqual(imported[0]!.id, first.id);
});
test("film projects stay isolated and alternate cuts never copy accepted generation jobs", () => {
  useStoryboard.setState({
    projects: [],
    activeProjectId: null,
    undoStack: [],
    redoStack: [],
    generating: false,
    editingBusy: false,
  });
  const state = useStoryboard.getState(),
    first = state.createProject("First film");
  state.append([
    {
      ...readyShot(),
      job: {
        phase: "interrupted",
        idempotencyKey: "accepted-intent",
        requestId: "accepted-request",
        startedAt: 1,
      },
    },
  ]);
  state.setNotes("Blue coat");
  const alternate = state.duplicateProject(first);
  assert.equal(
    useStoryboard.getState().projects.find((p) => p.id === alternate)!.shots[0]!
      .job,
    undefined,
  );
  state.openProject(alternate);
  state.remove(useStoryboard.getState().shots[0]!.id);
  state.undo();
  assert.equal(useStoryboard.getState().shots.length, 1);
  state.redo();
  assert.equal(useStoryboard.getState().shots.length, 0);
  state.openProject(first);
  assert.equal(
    useStoryboard.getState().shots[0]!.job!.requestId,
    "accepted-request",
  );
  assert.equal(useStoryboard.getState().notes, "Blue coat");
  state.setGenerating(true);
  assert.throws(() => state.openProject(alternate), /current operation/);
  state.setGenerating(false);
  state.archiveProject(alternate, true);
  assert.equal(
    useStoryboard.getState().projects.find((p) => p.id === alternate)!.archived,
    true,
  );
});
test("the old single-board storage migrates without losing footage or request identity", () => {
  const shot = {
    ...readyShot(),
    job: {
      phase: "queued" as const,
      idempotencyKey: "old-intent",
      requestId: "old-request",
      startedAt: 1,
    },
  };
  const merged = useStoryboard.persist.getOptions().merge!(
    { title: "Legacy film", notes: "Old notes", shots: [shot] },
    useStoryboard.getState(),
  );
  assert.equal(merged.projects.length, 1);
  assert.equal(merged.projects[0]!.title, "Legacy film");
  assert.equal(merged.shots[0]!.job!.requestId, "old-request");
  assert.equal(merged.shots[0]!.clip!.url, shot.clip!.url);
});

test("media processing rejects arbitrary servers, invalid cuts and excessive films", () => {
  assert.throws(
    () => validateMediaUrl("https://localhost/private"),
    /upload a video/,
  );
  assert.throws(
    () => validateMediaUrl("https://untrusted.example/video.mp4"),
    /upload a video/,
  );
  assert.throws(
    () => validateMediaUrl("https://higgsfield.ai.attacker.example/video.mp4"),
    /upload a video/,
  );
  assert.throws(
    () =>
      validateOperation({
        mode: "render",
        clips: [{ url: fixtureUrl, start: 2, end: 1 }],
      }),
    /0.1 seconds/,
  );
  assert.throws(
    () =>
      validateOperation({
        mode: "render",
        clips: [
          { url: fixtureUrl, start: 0, end: 400 },
          { url: fixtureUrl, start: 0, end: 400 },
        ],
      }),
    /10 minutes/,
  );
});
test(
  "real FFmpeg reads video, extracts the ending frame and renders exact cuts with decodable audio/video",
  { timeout: 120000 },
  async () => {
    const metadata = (
      await processMedia(
        validateOperation({ mode: "inspect", clips: [{ url: fixtureUrl }] }),
      )
    ).metadata!;
    assert.ok(metadata.duration > 2);
    const frame = await processMedia(
      validateOperation({
        mode: "frame",
        clips: [{ url: fixtureUrl }],
        time: 1,
      }),
    );
    assert.equal(frame.contentType, "image/jpeg");
    assert.equal(frame.bytes!.readUInt16BE(0), 0xffd8);
    const cuts = [
      { url: fixtureUrl, start: 0.3, end: 1.3 },
      { url: fixtureUrl, start: 1.5, end: 2.3, muted: true },
    ];
    for (const transition of ["cut", "fade"]) {
      const result = await processMedia(
        validateOperation({
          mode: "render",
          clips: cuts,
          format: "portrait",
          transition,
        }),
      );
      const file = path.join(temp, `${transition}.mp4`);
      await writeFile(file, result.bytes!);
      const { stdout } = await run(ffprobe.path, [
        "-v",
        "error",
        "-show_format",
        "-show_streams",
        "-of",
        "json",
        file,
      ]);
      const probe = JSON.parse(stdout);
      assert.ok(
        probe.streams.some(
          (s: { codec_type: string }) => s.codec_type === "audio",
        ),
      );
      const video = probe.streams.find(
        (s: { codec_type: string }) => s.codec_type === "video",
      );
      assert.equal(video.width, 720);
      assert.equal(video.height, 1280);
      const expected = transition === "fade" ? 1.8 - 0.8 / 3 : 1.8;
      assert.ok(Math.abs(Number(probe.format.duration) - expected) < 0.15);
      await run(ffmpeg!, ["-v", "error", "-i", file, "-f", "null", "-"], {
        timeout: 30000,
      });
    }
    await assert.rejects(
      processMedia(
        validateOperation({
          mode: "trim",
          clips: [{ url: fixtureUrl, start: 0, end: metadata.duration + 5 }],
        }),
      ),
      /outside the actual clip/,
    );
  },
);
