import { describe, test, expect } from "bun:test";
import { generateId, now, expiresAt, secondsAgo } from "../../src/shared/utils";

describe("generateId", () => {
  test("genera un id con prefijo", () => {
    const id = generateId("peer");
    expect(id).toMatch(/^peer_[0-9a-f]{8}$/);
  });

  test("prefijo por defecto es msg", () => {
    const id = generateId();
    expect(id).toMatch(/^msg_[0-9a-f]{8}$/);
  });

  test("ids son únicos", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe("now", () => {
  test("devuelve ISO string", () => {
    const ts = now();
    expect(() => new Date(ts)).not.toThrow();
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("expiresAt", () => {
  test("expira en el futuro", () => {
    const ts = expiresAt(30);
    expect(new Date(ts).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("secondsAgo", () => {
  test("timestamp reciente da ~0", () => {
    const ts = new Date().toISOString();
    expect(secondsAgo(ts)).toBeLessThan(1);
  });

  test("timestamp viejo da tiempo correcto", () => {
    const old = new Date(Date.now() - 5000).toISOString();
    expect(secondsAgo(old)).toBeGreaterThanOrEqual(4);
  });
});
