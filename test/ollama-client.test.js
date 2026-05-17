import { test } from "node:test";
import assert from "node:assert";
import { OllamaClient } from "../src/ollama/client.js";

test("OllamaClient embedBatch uses /api/embed when present", async () => {
  const calls = [];
  // @ts-expect-error test
  globalThis.fetch = async (input, init) => {
    calls.push(String(input));
    const url = String(input);
    if (url.endsWith("/api/embed")) {
      return new Response(
        JSON.stringify({ embeddings: [[0.1, 0.2], [0.3, 0.4]] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("unexpected", { status: 500 });
  };
  try {
    const c = new OllamaClient({
      baseUrl: "http://127.0.0.1:11434",
      embedModel: "m",
      chatModel: "c",
      timeoutMs: 5000,
      embedBatchSize: 8,
    });
    const out = await c.embedBatch(["a", "b"]);
    assert.strictEqual(calls.length, 1);
    assert.ok(calls[0].includes("/api/embed"));
    assert.strictEqual(out.length, 2);
    assert.strictEqual(out[0][0], 0.1);
  } finally {
    delete globalThis.fetch;
  }
});

test("OllamaClient embedBatch falls back to /api/embeddings on 404", async () => {
  const calls = [];
  // @ts-expect-error test
  globalThis.fetch = async (input, init) => {
    calls.push(String(input));
    const url = String(input);
    if (url.endsWith("/api/embed")) {
      return new Response("nope", { status: 404 });
    }
    if (url.endsWith("/api/embeddings")) {
      return new Response(
        JSON.stringify({ embeddings: [[0.5, 0.6]] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("unexpected", { status: 500 });
  };
  try {
    const c = new OllamaClient({
      baseUrl: "http://127.0.0.1:11434",
      embedModel: "m",
      chatModel: "c",
      timeoutMs: 5000,
      embedBatchSize: 8,
    });
    const out = await c.embedBatch(["x"]);
    assert.ok(calls[0].includes("/api/embed"));
    assert.ok(calls[1].includes("/api/embeddings"));
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0][0], 0.5);
  } finally {
    delete globalThis.fetch;
  }
});
