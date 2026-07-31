import { describe, expect, it } from "vitest";
import { assertPublicUrl, isPrivateAddress, normalizeUrl } from "../src/tools/web.js";

describe("web gateway security", () => {
  it("normalizes and removes tracking parameters", () => expect(normalizeUrl("HTTPS://Example.COM:443/a/?utm_source=x&b=2&a=1#x")).toBe("https://example.com/a?a=1&b=2"));
  it.each(["127.0.0.1", "10.2.3.4", "172.16.1.1", "192.168.2.2", "169.254.169.254", "::1", "fd00::1"])("blocks private address %s", (ip) => expect(isPrivateAddress(ip)).toBe(true));
  it("blocks localhost and metadata endpoints", async () => { await expect(assertPublicUrl("http://localhost/test")).rejects.toThrow(/Blocked/); await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow(/Blocked/); });
});
