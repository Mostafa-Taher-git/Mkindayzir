/**
 * TC-API-01  sends JSON content-type + credentials on every request
 * TC-API-02  GET passes no body; POST/PATCH stringify the payload
 * TC-API-03  non-2xx surfaces the server's error.message ({"error":{...}} envelope)
 * TC-API-04  204 returns without attempting res.json()
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { api } from "@/lib/api";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("api wrapper", () => {
  it("TC-API-01: JSON content-type and include credentials", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    await api.get("/api/ping");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/ping");
    expect(init.credentials).toBe("include");
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("TC-API-02: POST stringifies body", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    await api.post("/api/things", { a: 1 });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });

  it("TC-API-03: surfaces server error message from error envelope", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: "403", message: "No soup for you" } }), { status: 403 })
    );
    await expect(api.get("/api/forbidden")).rejects.toThrow("No soup for you");
  });

  it("TC-API-04: 204 handled without json parse", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const out = await api.delete("/api/gone");
    expect(out).toEqual({});
  });
});
