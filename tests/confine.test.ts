import { mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { confined } from "../src/tools/index.js";

describe("read_artifact confinement", () => {
  it("rejects paths that escape the project directory lexically", () => {
    const root = mkdtempSync(resolve(tmpdir(), "hm-confine-"));
    expect(() => confined(root, "../../etc/passwd")).toThrow(/escapes/);
  });
  it("rejects symlinks that point outside the project directory", () => {
    const root = mkdtempSync(resolve(tmpdir(), "hm-confine-"));
    const outside = mkdtempSync(resolve(tmpdir(), "hm-outside-"));
    const target = resolve(outside, "secret.txt"); writeFileSync(target, "secret");
    const link = resolve(root, "leak.md"); symlinkSync(target, link);
    expect(() => confined(root, "leak.md")).toThrow(/escapes/);
  });
  it("allows paths inside the project directory", () => {
    const root = mkdtempSync(resolve(tmpdir(), "hm-confine-"));
    expect(confined(root, "memory/findings/x.md")).toBe(resolve(root, "memory/findings/x.md"));
  });
});
