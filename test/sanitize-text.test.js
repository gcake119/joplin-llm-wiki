import { test } from "node:test";
import assert from "node:assert";
import { stripUnpairedSurrogates } from "../src/index/sanitize-text.js";
import { chunkText } from "../src/index/chunker.js";

test("stripUnpairedSurrogates leaves BMP and surrogate pairs intact", () => {
  assert.strictEqual(stripUnpairedSurrogates("abc"), "abc");
  assert.strictEqual(stripUnpairedSurrogates("天"), "天");
  const grin = "\uD83D\uDE00"; // 😀
  assert.strictEqual(stripUnpairedSurrogates(grin), grin);
});

test("stripUnpairedSurrogates replaces lone surrogates", () => {
  assert.strictEqual(stripUnpairedSurrogates("\uD800"), "\uFFFD");
  assert.strictEqual(stripUnpairedSurrogates("\uDC00"), "\uFFFD");
  assert.strictEqual(stripUnpairedSurrogates("a\uD800b"), "a\uFFFDb");
});

function hasUnpairedSurrogate(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (d >= 0xdc00 && d <= 0xdfff) {
        i++;
        continue;
      }
      return true;
    }
    if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
}

test("chunkText does not split emoji across chunks (Unicode code points)", () => {
  const emoji = "\uD83D\uDE00"; // 😀
  const text = `${"x".repeat(9)}${emoji}${"y".repeat(40)}`;
  const chunks = chunkText(text, 10, 0);
  assert.ok(chunks.length >= 2, "fixture spans multiple chunks");
  assert.ok(chunks.some((c) => c.includes(emoji)), "supplementary plane char stays intact in one slice");
  for (const raw of chunks) {
    assert.ok(
      !hasUnpairedSurrogate(raw),
      "chunk boundaries must fall on surrogate-pair borders",
    );
  }
});

test("chunkText uses code-point length for BMP runs", () => {
  assert.deepStrictEqual(
    chunkText("abcdefghij", 4, 0),
    ["abcd", "efgh", "ij"],
  );
  assert.deepStrictEqual(
    chunkText("天大地方", 2, 0),
    ["天大", "地方"],
  );
});
