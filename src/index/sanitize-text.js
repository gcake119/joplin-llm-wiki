/**
 * Replace unpaired UTF-16 surrogate code units with U+FFFD so strings are safe
 * for JSON bodies (e.g. Chroma HTTP API rejects lone \\uD800..\\uDFFF escapes).
 * Also fixes chunk boundaries that split a supplementary character (emoji, etc.)
 * into two invalid lone halves.
 *
 * @param {string} s
 * @returns {string}
 */
export function stripUnpairedSurrogates(s) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d =
        i + 1 < s.length ? s.charCodeAt(i + 1) : 0xdfff + 1;
      if (d >= 0xdc00 && d <= 0xdfff) {
        out += s.slice(i, i + 2);
        i++;
      } else {
        out += "\uFFFD";
      }
      continue;
    }
    if (c >= 0xdc00 && c <= 0xdfff) {
      out += "\uFFFD";
      continue;
    }
    out += s[i];
  }
  return out;
}
