import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createAssistantMessageEventStream, type AssistantMessage, type Model } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { AgentTree } from "../src/agent-tree.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { PiAgentRuntimeFactory } from "../src/pi-runtime.js";
import { ResearchMemory } from "../src/research-memory.js";
import { RunStore } from "../src/run-store.js";
import { ExperimentRunner } from "../src/tools/experiment.js";
import { WebGateway } from "../src/tools/web.js";

describe("PiAgentRuntimeFactory", () => {
  it("runs a child through a real AgentSession with a fake official ModelRuntime", async () => {
    const cwd = mkdtempSync(resolve(tmpdir(), "hm-pi-runtime-"));
    const model: Model<any> = { id: "fake-model", name: "Fake model", api: "openai-completions", provider: "hm-fake", baseUrl: "http://invalid.test", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 32_000, maxTokens: 2_000 };
    const runtime = await ModelRuntime.create({ authPath: resolve(cwd, "auth.json"), modelsPath: null });
    runtime.registerNativeProvider({ id: "hm-fake", name: "HM fake provider", auth: { apiKey: { name: "fake", resolve: async () => ({ auth: { apiKey: "not-a-real-secret" }, source: "test" }) } }, getModels: () => [model], stream: () => { throw new Error("simple stream expected"); }, streamSimple: () => { const stream = createAssistantMessageEventStream(); const message: AssistantMessage = { role: "assistant", content: [{ type: "text", text: "fake child result" }], api: model.api, provider: model.provider, model: model.id, usage: { input: 1, output: 3, cacheRead: 0, cacheWrite: 0, totalTokens: 4, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: Date.now() }; queueMicrotask(() => stream.end(message)); return stream; } });
    const stateDir = resolve(cwd, ".hypothesis-machine"); const store = new RunStore(stateDir); const memory = new ResearchMemory(stateDir); const web = new WebGateway(DEFAULT_CONFIG, memory); const experiments = new ExperimentRunner(stateDir, DEFAULT_CONFIG.experiment);
    const factory = new PiAgentRuntimeFactory({ cwd, config: DEFAULT_CONFIG, store, memory, web, experiments, modelRuntime: runtime, model, thinkingLevel: "off" }); const tree = new AgentTree(store, factory, DEFAULT_CONFIG, { goal: "Test the official child runtime" }); factory.attachTree(tree);
    const child = await tree.spawn({ parentId: tree.rootId, name: "Runtime Child", role: "Runtime verifier", task: "Return the deterministic fake model response", expectedOutput: "Text result", completionCriteria: "A response is persisted", tools: [], background: false });
    const result = await tree.start(child.id); expect(result.summary).toBe("fake child result"); expect(tree.inspect(child.id).sessionFile).toMatch(/\.jsonl$/); expect(tree.inspect(child.id).status).toBe("completed"); memory.close();
  });
});
