import { spawn } from "node:child_process";
import { resolve } from "node:path";

const pi = process.env.PI_SMOKE_BIN || resolve("node_modules/.bin/pi");
const child = spawn(pi, ["--mode", "rpc", "--no-session", "--no-extensions", "--extension", "./src/index.ts"], { cwd: process.cwd(), env: { ...process.env, PI_OFFLINE: "1" }, stdio: ["pipe", "pipe", "pipe"] });
let stdout = "", stderr = "";
child.stdout.on("data", (chunk) => stdout += String(chunk)); child.stderr.on("data", (chunk) => stderr += String(chunk));
child.stdin.end('{"type":"get_commands"}\n');
const code = await new Promise((resolveCode, reject) => { const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Pi RPC smoke timed out")); }, 15_000); child.on("close", (value) => { clearTimeout(timer); resolveCode(value); }); child.on("error", reject); });
if (code !== 0) throw new Error(`Pi exited ${code}: ${stderr}`);
const responses = stdout.trim().split("\n").flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
const commands = responses.find((item) => item.type === "response" && item.command === "get_commands");
const names = commands?.data?.commands?.map((item) => item.name) ?? [];
for (const required of ["team", "research", "research-stop", "findings", "hypotheses"]) if (!names.includes(required)) throw new Error(`Missing Pi command ${required}`);
process.stdout.write(`Pi RPC extension smoke passed via ${pi} (${names.filter((name) => ["team", "research", "research-stop", "findings", "hypotheses"].includes(name)).length} commands checked)\n`);
