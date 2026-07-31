import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import YAML from "yaml";

export const MEMORY_TYPES = ["fact", "inference", "hypothesis", "counterargument", "experiment_result", "open_question"] as const;
export const MEMORY_STATUSES = ["observed", "corroborated", "contested", "inferred", "hypothetical", "tested", "rejected", "outdated"] as const;
export type MemoryType = typeof MEMORY_TYPES[number];
export type MemoryStatus = typeof MEMORY_STATUSES[number];

export interface MemoryEntryInput {
  id?: string; type: MemoryType; status: MemoryStatus; createdBy: string; runId: string;
  title: string; statement: string; evidence?: string; counterevidence?: string; limitations?: string;
  sources?: string[]; related?: string[]; negativeResult?: boolean;
}

export interface MemorySearchResult { id: string; kind: string; status: string; title: string; path: string; snippet: string; rank: number }

function frontmatterDocument(input: MemoryEntryInput, id: string): string {
  const meta = { id, type: input.type, status: input.status, created_by: input.createdBy, run_id: input.runId, sources: input.sources ?? [], related: input.related ?? [], negative_result: input.negativeResult ?? false };
  return `---\n${YAML.stringify(meta).trim()}\n---\n\n# ${input.title}\n\n${input.statement.trim()}\n\n# Evidence\n\n${input.evidence?.trim() || "No external evidence recorded; do not treat this entry as a corroborated fact."}\n\n# Counterevidence\n\n${input.counterevidence?.trim() || "None recorded."}\n\n# Limitations\n\n${input.limitations?.trim() || "Not assessed."}\n`;
}

function walkMarkdown(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name); return entry.isDirectory() ? walkMarkdown(path) : extname(path) === ".md" ? [path] : [];
  });
}

export class ResearchMemory {
  private db: DatabaseSync | undefined;
  readonly memoryDir: string;
  readonly sourcesDir: string;
  readonly artifactsDir: string;
  readonly indexPath: string;

  constructor(readonly stateDir: string) {
    this.memoryDir = resolve(stateDir, "memory"); this.sourcesDir = resolve(stateDir, "sources"); this.artifactsDir = resolve(stateDir, "artifacts"); this.indexPath = resolve(stateDir, "index.sqlite");
    for (const part of ["findings", "hypotheses", "questions", "syntheses", "decisions", "agent-lessons"]) mkdirSync(resolve(this.memoryDir, part), { recursive: true });
    mkdirSync(this.sourcesDir, { recursive: true }); mkdirSync(this.artifactsDir, { recursive: true });
  }

  private database(): DatabaseSync {
    if (this.db) return this.db;
    this.db = new DatabaseSync(this.indexPath);
    this.db.exec("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL, title TEXT NOT NULL, path TEXT NOT NULL UNIQUE, hash TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(id UNINDEXED, title, body); CREATE TABLE IF NOT EXISTS relations(source_id TEXT NOT NULL, target_id TEXT NOT NULL, relation TEXT NOT NULL, PRIMARY KEY(source_id,target_id,relation));");
    return this.db;
  }

  save(input: MemoryEntryInput): string {
    if (input.status === "corroborated" && (!input.sources?.length || !input.evidence?.trim())) throw new Error("A corroborated finding requires sources and concrete evidence");
    const id = input.id ?? `${input.type.replace("experiment_result", "experiment")}-${randomUUID().slice(0, 8)}`;
    const folder = input.type === "hypothesis" ? "hypotheses" : input.type === "open_question" ? "questions" : "findings";
    const path = resolve(this.memoryDir, folder, `${id}.md`);
    if (!path.startsWith(`${this.memoryDir}/`)) throw new Error("Invalid memory path");
    writeFileSync(path, frontmatterDocument(input, id), { encoding: "utf8", mode: 0o600 });
    this.indexFile(path); return id;
  }

  saveSource(url: string, content: Buffer, mime: string, retrievedAt = new Date().toISOString()): { id: string; path: string; hash: string } {
    const hash = createHash("sha256").update(content).digest("hex"); const id = `source-${hash.slice(0, 16)}`;
    const dir = resolve(this.sourcesDir, id); mkdirSync(dir, { recursive: true });
    const path = resolve(dir, "original.bin"); if (!existsSync(path)) writeFileSync(path, content, { mode: 0o600 });
    writeFileSync(resolve(dir, "metadata.json"), `${JSON.stringify({ id, url, mime, retrievedAt, sha256: hash, untrusted: true, size: content.length }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    return { id, path, hash };
  }

  indexFile(path: string): void {
    const raw = readFileSync(path, "utf8"); const front = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/); if (!front) return;
    const meta = YAML.parse(front[1]!) as Record<string, unknown>; const body = front[2]!; const title = body.match(/^# (.+)$/m)?.[1] ?? basename(path, ".md");
    const id = String(meta.id ?? basename(path, ".md")); const kind = String(meta.type ?? "unknown"); const status = String(meta.status ?? "observed"); const hash = createHash("sha256").update(raw).digest("hex"); const db = this.database();
    db.prepare("INSERT INTO documents(id,kind,status,title,path,hash,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,status=excluded.status,title=excluded.title,path=excluded.path,hash=excluded.hash,updated_at=excluded.updated_at").run(id, kind, status, title, path, hash, statSync(path).mtime.toISOString());
    db.prepare("DELETE FROM documents_fts WHERE id=?").run(id); db.prepare("INSERT INTO documents_fts(id,title,body) VALUES(?,?,?)").run(id, title, body);
    db.prepare("DELETE FROM relations WHERE source_id=?").run(id); for (const related of (meta.related as string[] | undefined) ?? []) db.prepare("INSERT OR IGNORE INTO relations VALUES(?,?,?)").run(id, related, "related");
  }

  rebuildIndex(): number {
    this.close(); if (existsSync(this.indexPath)) { const db = new DatabaseSync(this.indexPath); db.exec("DROP TABLE IF EXISTS documents; DROP TABLE IF EXISTS documents_fts; DROP TABLE IF EXISTS relations;"); db.close(); }
    const files = walkMarkdown(this.memoryDir); for (const file of files) this.indexFile(file); return files.length;
  }

  search(query: string, limit = 10): MemorySearchResult[] {
    const safeLimit = Math.max(1, Math.min(50, limit));
    const expression = this.ftsExpression(query); if (!expression) return [];
    return this.database().prepare("SELECT d.id,d.kind,d.status,d.title,d.path,snippet(documents_fts,2,'[',']',' … ',24) snippet,bm25(documents_fts) rank FROM documents_fts JOIN documents d ON d.id=documents_fts.id WHERE documents_fts MATCH ? ORDER BY rank LIMIT ?").all(expression, safeLimit) as unknown as MemorySearchResult[];
  }
  /** Build an FTS5 MATCH expression: split on punctuation, drop operators, prefix long tokens to tolerate inflections (no stemming in unicode61). */
  private ftsExpression(query: string): string {
    const tokens = query.replace(/["'`]/g, " ").split(/[^\p{L}\p{N}_]+/u).filter(Boolean).filter((word) => !/^(and|or|not|near)$/i.test(word));
    if (!tokens.length) return "";
    return tokens.map((word) => (word.length >= 4 ? `\"${word}\"*` : `\"${word}\"`)).join(" OR ");
  }
  list(kind?: string): Array<Record<string, unknown>> { return this.database().prepare(kind ? "SELECT * FROM documents WHERE kind=? ORDER BY updated_at DESC" : "SELECT * FROM documents ORDER BY updated_at DESC").all(...(kind ? [kind] : [])) as Array<Record<string, unknown>>; }
  close(): void { this.db?.close(); this.db = undefined; }
}
