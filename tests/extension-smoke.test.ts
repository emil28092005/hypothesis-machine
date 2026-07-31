import { describe, expect, it } from "vitest";
import extension from "../src/index.js";

describe("Pi extension smoke", () => {
  it("loads as an extension factory and registers all commands", () => { const commands: string[] = []; const events: string[] = []; const renderers: string[] = []; const fakePi = { on: (name: string) => events.push(name), registerCommand: (name: string) => commands.push(name), registerMessageRenderer: (name: string) => renderers.push(name) } as any; extension(fakePi); expect(commands).toEqual(expect.arrayContaining(["team", "research", "research-status", "research-pause", "research-resume", "research-stop", "findings", "hypotheses"])); expect(events).toEqual(expect.arrayContaining(["session_start", "session_shutdown"])); expect(renderers).toContain("hypothesis-machine-agent-update"); });
});
