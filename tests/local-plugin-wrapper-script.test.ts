import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

describe("local plugin wrapper installer", () => {
  it("writes an ESM wrapper and package marker for OpenCode local plugin loading", () => {
    const configDir = mkdtempSync(join(tmpdir(), "opencode-mem-local-plugin-"));

    try {
      const env = {
        ...process.env,
        OPENCODE_CONFIG_DIR: configDir,
      };

      const install = spawnSync("node", ["scripts/install-local-plugin-wrapper.mjs"], {
        cwd: process.cwd(),
        env,
        encoding: "utf-8",
      });

      expect(install.status).toBe(0);

      const packageJson = JSON.parse(
        readFileSync(join(configDir, "plugins", "package.json"), "utf-8")
      ) as Record<string, unknown>;
      expect(packageJson).toEqual({ type: "module" });

      const wrapper = readFileSync(join(configDir, "plugins", "opencode-mem.js"), "utf-8");
      expect(wrapper).toContain('import { pathToFileURL } from "node:url";');
      expect(wrapper).toContain("export { id, OpenCodeMemPlugin };");
      expect(wrapper).toContain("export const server = OpenCodeMemPlugin;");
      expect(wrapper).toContain("export default {");
      expect(wrapper).not.toContain("require(");
      expect(wrapper).not.toContain("module.exports");

      const check = spawnSync("node", ["scripts/install-local-plugin-wrapper.mjs", "--check"], {
        cwd: process.cwd(),
        env,
        encoding: "utf-8",
      });

      expect(check.status).toBe(0);
    } finally {
      rmSync(configDir, { recursive: true, force: true });
    }
  });
});
