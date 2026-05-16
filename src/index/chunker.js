/**
 * @param {string} text
 * @param {number} sizeChars
 * @param {number} overlapChars
 * @returns {string[]}
 */
export function chunkText(text, sizeChars, overlapChars) {
  if (text.length === 0) return [""];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + sizeChars);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start = Math.max(0, end - overlapChars);
  }
  return chunks;
}
