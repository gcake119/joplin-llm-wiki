import { test } from "node:test";
import assert from "node:assert";
import { OllamaClient } from "../src/ollama/client.js";

test("OllamaClient chatComplete uses configured chat model", async () => {
  const calls = [];
  // @ts-expect-error test
  globalThis.fetch = async (input, init) => {
    calls.push(String(input));
    const url = String(input);
    const body = JSON.parse(String(init.body));
    assert.strictEqual(body.model, "c");
    if (url.endsWith("/api/chat")) {
      return new Response(
        JSON.stringify({ message: { content: "回答" } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("unexpected", { status: 500 });
  };
  try {
    const c = new OllamaClient({
      baseUrl: "http://127.0.0.1:11434",
      chatModel: "c",
      timeoutMs: 5000,
    });
    const out = await c.chatComplete({ prompt: "問題" });
    assert.strictEqual(calls.length, 1);
    assert.ok(calls[0].includes("/api/chat"));
    assert.strictEqual(out, "回答");
  } finally {
    delete globalThis.fetch;
  }
});
