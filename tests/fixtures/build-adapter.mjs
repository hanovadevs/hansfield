import assert from "node:assert/strict";
import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Exercises the same adapter lifecycle that triggered the Next 16.3 failure.
export default {
  name: "jenera-build-regression",
  async onBuildComplete({ outputs, config, distDir }) {
    assert.notEqual(config.output, "standalone");
    for (const pathname of [
      "/api/generations",
      "/api/usage",
      "/api/film/process",
      "/api/health",
    ]) {
      const route = outputs.appRoutes.find(
        (item) => item.pathname === pathname,
      );
      assert.ok(route, `Adapter is missing ${pathname}`);
      assert.equal(route.runtime, "nodejs");
      await access(route.filePath);
      if (["/api/film/process", "/api/health"].includes(pathname)) {
        const assets = Object.values(route.assets).map((file) =>
          file.replaceAll("\\", "/"),
        );
        assert.ok(
          assets.some((file) => /ffmpeg-static\/index\.js$/.test(file)),
          `${pathname} lacks FFmpeg's entrypoint`,
        );
        assert.ok(
          assets.some((file) => /ffmpeg-static\/ffmpeg(?:\.exe)?$/.test(file)),
          `${pathname} lacks FFmpeg's binary`,
        );
        assert.ok(
          assets.some((file) => /ffprobe-static\/index\.js$/.test(file)),
          `${pathname} lacks FFprobe's entrypoint`,
        );
        assert.ok(
          assets.some((file) =>
            /ffprobe-static\/bin\/.*\/ffprobe(?:\.exe)?$/.test(file),
          ),
          `${pathname} lacks FFprobe's binary`,
        );
      }
    }
    await writeFile(
      join(distDir, "adapter-regression.json"),
      JSON.stringify({ passed: true }),
    );
  },
};
