import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";

const createdDirs: string[] = [];

async function loadTags() {
  return import(`../src/services/tags.js?project-scope=${Date.now()}-${Math.random()}`);
}

function run(command: string, cwd: string): void {
  const result = Bun.spawnSync({
    cmd: ["sh", "-c", command],
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    const stderr = Buffer.from(result.stderr).toString("utf8").trim();
    throw new Error(`Command failed: ${command}\n${stderr}`);
  }
}

function createRepoWithWorktree(): { repoDir: string; worktreeDir: string } {
  const repoDir = mkdtempSync(join(tmpdir(), "opencode-mem-scope-"));
  createdDirs.push(repoDir);

  run("git init", repoDir);
  run("git config user.email test@example.com", repoDir);
  run("git config user.name Test User", repoDir);

  writeFileSync(join(repoDir, "README.md"), "# test\n", "utf-8");
  run("git add README.md", repoDir);
  run('git commit -m "init"', repoDir);

  const worktreeRoot = join(repoDir, ".worktrees");
  mkdirSync(worktreeRoot, { recursive: true });
  const worktreeDir = join(worktreeRoot, "feature-a");
  run(`git worktree add "${worktreeDir}" -b feature-a`, repoDir);

  return { repoDir, worktreeDir };
}

afterEach(() => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

beforeEach(() => {
  mock.restore();
});

describe("project scope identity", () => {
  it("uses one project tag across worktrees in the same repo", async () => {
    const { getProjectTagInfo } = await loadTags();
    const { repoDir, worktreeDir } = createRepoWithWorktree();

    const mainTag = getProjectTagInfo(repoDir);
    const worktreeTag = getProjectTagInfo(worktreeDir);

    expect(mainTag.tag).toBe(worktreeTag.tag);
    expect(mainTag.projectPath).toBe(worktreeTag.projectPath);
    expect(mainTag.projectName).toBe(basename(repoDir));
  });

  it("uses different project tags for unrelated non-git directories", async () => {
    const { getProjectTagInfo } = await loadTags();
    const left = mkdtempSync(join(tmpdir(), "opencode-mem-left-"));
    const right = mkdtempSync(join(tmpdir(), "opencode-mem-right-"));
    createdDirs.push(left, right);

    const leftTag = getProjectTagInfo(left);
    const rightTag = getProjectTagInfo(right);

    expect(leftTag.tag).not.toBe(rightTag.tag);
  });

  it("uses the same project tag from nested paths inside the same repo", async () => {
    const { getProjectTagInfo } = await loadTags();
    const { repoDir } = createRepoWithWorktree();
    const nestedDir = join(repoDir, "src", "features", "memory");
    mkdirSync(nestedDir, { recursive: true });

    const rootTag = getProjectTagInfo(repoDir);
    const nestedTag = getProjectTagInfo(nestedDir);

    expect(rootTag.tag).toBe(nestedTag.tag);
    expect(rootTag.projectPath).toBe(nestedTag.projectPath);
  });
});
