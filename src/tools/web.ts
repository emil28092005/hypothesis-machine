import { createHash } from "node:crypto";
import { promises as dns } from "node:dns";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { request as httpRequest, type IncomingHttpHeaders, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { resolve } from "node:path";
import type { HypothesisMachineConfig } from "../config.js";
import type { ResearchMemory } from "../research-memory.js";

const TRACKING = /^(utm_[a-z]+|fbclid|gclid|mc_[a-z]+)$/i;
const ALLOWED_MIME = /^(text\/|application\/(json|pdf|xml|xhtml\+xml|octet-stream)|image\/(png|jpeg|webp|gif))/i;

export function normalizeUrl(raw: string): string {
  const url = new URL(raw); if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only http(s) URLs are allowed");
  url.hash = ""; url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) url.port = "";
  for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key);
  url.searchParams.sort(); if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, ""); return url.toString();
}

export function isPrivateAddress(address: string): boolean {
  const lower = address.toLowerCase();
  if (lower === "::1" || lower === "::" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1]; if (mapped) return isPrivateAddress(mapped);
  if (isIP(address) === 4) {
    const [a = 0, b = 0] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224 || (a === 100 && b >= 64 && b <= 127);
  }
  return false;
}

export async function assertPublicUrl(raw: string): Promise<string> {
  const normalized = normalizeUrl(raw); const url = new URL(normalized);
  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost") || url.hostname === "metadata.google.internal") throw new Error("Blocked local or metadata hostname");
  const addresses = await dns.lookup(url.hostname, { all: true }); if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("Blocked private, local, or reserved network target");
  return normalized;
}

async function limitedFetch(url: string, init: { headers?: Record<string, string> }, timeoutMs: number, maxBytes: number): Promise<{ response: { status: number; headers: IncomingHttpHeaders }; bytes: Buffer; finalUrl: string }> {
  let current = url;
  for (let redirects = 0; redirects <= 5; redirects++) {
    current = await assertPublicUrl(current);
    const { status, headers, body } = await pinnedGet(new URL(current), init.headers ?? {}, timeoutMs, maxBytes);
    if (status >= 300 && status < 400) { const location = headers.location; if (!location) throw new Error("Redirect missing Location header"); current = new URL(location, current).toString(); continue; }
    if (status < 200 || status >= 300) throw new Error(`HTTP ${status} from ${new URL(current).origin}`);
    return { response: { status, headers }, bytes: body, finalUrl: current };
  }
  throw new Error("Too many redirects");
}

/** Resolve and validate a hostname once, then connect to the validated address so DNS rebinding cannot redirect the connection to a private target. */
async function pinnedGet(url: URL, headers: Record<string, string>, timeoutMs: number, maxBytes: number): Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }> {
  const addresses = await dns.lookup(url.hostname, { all: true });
  const publicAddresses = addresses.map((entry) => entry.address).filter((address) => !isPrivateAddress(address));
  if (!publicAddresses.length) throw new Error("Blocked private, local, or reserved network target");
  const address = publicAddresses[0]!;
  const isIpv6 = address.includes(":");
  const defaultPort = url.protocol === "https:" ? 443 : 80;
  const port = url.port ? Number(url.port) : defaultPort;
  const hostHeader = url.port && url.port !== String(defaultPort) ? `${url.hostname}:${url.port}` : url.hostname;
  const requestOptions: RequestOptions & { servername?: string } = {
    protocol: url.protocol, hostname: isIpv6 ? address.replace(/^\[|\]$/g, "") : address, port,
    path: `${url.pathname}${url.search}`, method: "GET", headers: { ...headers, Host: hostHeader },
    ...(url.protocol === "https:" ? { servername: url.hostname } : {}),
  };
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  return await new Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }>((resolvePromise, reject) => {
    const req = request(requestOptions, (response) => {
      const status = response.statusCode ?? 0;
      const declared = Number(response.headers["content-length"] ?? 0); if (declared > maxBytes) { response.destroy(); reject(new Error(`Content exceeds ${maxBytes} byte limit`)); return; }
      const chunks: Buffer[] = []; let total = 0; let failed = false;
      response.on("data", (chunk: Buffer) => { if (failed) return; total += chunk.length; if (total > maxBytes) { failed = true; response.destroy(); reject(new Error(`Content exceeds ${maxBytes} byte limit`)); return; } chunks.push(chunk); });
      response.on("end", () => { if (!failed) resolvePromise({ status, headers: response.headers, body: Buffer.concat(chunks) }); });
      response.on("error", (error) => { if (!failed) { failed = true; reject(error); } });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Request timed out after ${timeoutMs}ms`)));
    req.on("error", (error) => reject(error));
    req.end();
  });
}

export interface WebDocument { url: string; title?: string; content: string; mime: string; sourceId: string; sha256: string; retrievedAt: string; untrusted: true; backend: string }

export class WebGateway {
  private readonly cacheDir: string;
  constructor(private readonly config: HypothesisMachineConfig, private readonly memory: ResearchMemory) { this.cacheDir = resolve(memory.stateDir, "artifacts", "web-cache"); mkdirSync(this.cacheDir, { recursive: true }); }
  private cachePath(url: string): string { return resolve(this.cacheDir, `${createHash("sha256").update(url).digest("hex")}.json`); }

  async health(): Promise<Record<string, string>> {
    const checks = await Promise.all([["searxng", this.config.searxng_url], ["firecrawl", this.config.firecrawl_url], ["browser-use", this.config.browser_use_url]].map(async ([name, url]) => {
      if (!url) return [name, "not configured"] as const; try { const response = await fetch(url, { signal: AbortSignal.timeout(3000) }); return [name, response.ok || response.status === 404 ? "reachable" : `HTTP ${response.status}`] as const; } catch (error) { return [name, `unavailable: ${error instanceof Error ? error.message : String(error)}`] as const; }
    })); return Object.fromEntries(checks);
  }

  async search(query: string, limit = 10): Promise<Array<{ title: string; url: string; snippet: string }>> {
    const url = new URL("/search", this.config.searxng_url); url.searchParams.set("q", query); url.searchParams.set("format", "json");
    const response = await fetch(url, { signal: AbortSignal.timeout(this.config.web_timeout_ms) }); if (!response.ok) throw new Error(`SearXNG HTTP ${response.status}; run docker compose -f infra/compose.yaml up -d`);
    const body = await response.json() as { results?: Array<{ title?: string; url?: string; content?: string }> };
    const results: Array<{ title: string; url: string; snippet: string }> = [];
    for (const item of (body.results ?? [])) { if (!item.url) continue; try { results.push({ title: item.title ?? item.url, url: normalizeUrl(item.url), snippet: item.content ?? "" }); } catch { /* skip malformed result URLs */ } if (results.length >= Math.max(1, Math.min(50, limit))) break; }
    return results;
  }

  async read(rawUrl: string, refresh = false): Promise<WebDocument> {
    const url = await assertPublicUrl(rawUrl); const cache = this.cachePath(url); if (!refresh && existsSync(cache)) return JSON.parse(readFileSync(cache, "utf8")) as WebDocument;
    const endpoint = new URL("/v2/scrape", this.config.firecrawl_url); const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, removeBase64Images: true, timeout: this.config.web_timeout_ms }), signal: AbortSignal.timeout(this.config.web_timeout_ms + 5000) });
    if (!response.ok) throw new Error(`Firecrawl HTTP ${response.status}; verify the self-hosted service`);
    const raw = await response.json() as any; const data = raw.data ?? raw; const content = String(data.markdown ?? data.content ?? ""); if (Buffer.byteLength(content) > this.config.max_download_bytes) throw new Error("Firecrawl response exceeds size limit");
    const bytes = Buffer.from(content); const saved = this.memory.saveSource(url, bytes, "text/markdown"); const document: WebDocument = { url, title: data.metadata?.title, content, mime: "text/markdown", sourceId: saved.id, sha256: saved.hash, retrievedAt: new Date().toISOString(), untrusted: true, backend: "firecrawl" };
    writeFileSync(cache, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", mode: 0o600 }); this.evictCache(500); return document;
  }

  async crawl(rawUrl: string, limit = 20): Promise<unknown> {
    const url = await assertPublicUrl(rawUrl); const response = await fetch(new URL("/v2/crawl", this.config.firecrawl_url), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, limit: Math.max(1, Math.min(100, limit)), scrapeOptions: { formats: ["markdown"], onlyMainContent: true } }), signal: AbortSignal.timeout(this.config.web_timeout_ms) });
    if (!response.ok) throw new Error(`Firecrawl crawl HTTP ${response.status}`); return response.json();
  }

  async browse(rawUrl: string, task: string): Promise<unknown> {
    const url = await assertPublicUrl(rawUrl); if (!this.config.browser_use_url) throw new Error("Browser Use fallback is not configured. Set browser_use_url to a local adapter; no cloud credentials are read by Hypothesis Machine.");
    const response = await fetch(new URL("/browse", this.config.browser_use_url), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, task, allowedDomains: [new URL(url).hostname], ephemeralProfile: true }), signal: AbortSignal.timeout(this.config.web_timeout_ms) });
    if (!response.ok) throw new Error(`Browser Use adapter HTTP ${response.status}`); return response.json();
  }

  async downloadSource(rawUrl: string): Promise<{ id: string; path: string; hash: string }> {
    const url = await assertPublicUrl(rawUrl); const { response, bytes, finalUrl } = await limitedFetch(url, { headers: { "user-agent": "HypothesisMachine/0.1" } }, this.config.web_timeout_ms, this.config.max_download_bytes);
    const rawContentType = response.headers["content-type"]; const mime = (Array.isArray(rawContentType) ? rawContentType[0] : rawContentType ?? "application/octet-stream").split(";")[0]!; if (!ALLOWED_MIME.test(mime)) throw new Error(`Blocked MIME type: ${mime}`); return this.memory.saveSource(finalUrl, bytes, mime);
  }
  /** Bound the disk used by the web cache: evict oldest entries once the cap is exceeded. */
  private evictCache(cap: number): void {
    if (!existsSync(this.cacheDir)) return;
    const files = readdirSync(this.cacheDir, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => ({ name: entry.name, path: resolve(this.cacheDir, entry.name), mtime: statSync(resolve(this.cacheDir, entry.name)).mtimeMs }));
    if (files.length <= cap) return;
    files.sort((a, b) => a.mtime - b.mtime);
    for (const file of files.slice(0, files.length - cap)) { try { unlinkSync(file.path); } catch { /* best effort */ } }
  }
}
