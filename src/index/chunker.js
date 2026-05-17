/**
 * @param {string} text
 * @param {number} sizeChars  — max **Unicode scalar values（碼位）** per chunk（輔助平面 emoji 視為一格）
 * @param {number} overlapChars — 相鄰兩块重疊的碼位數（會裁切至 size−1，以保證區塊前移）
 * @returns {string[]}
 */
export function chunkText(text, sizeChars, overlapChars) {
  if (text.length === 0) return [""];
  const scalars = [...text];
  const n = scalars.length;
  const sizeCp = Math.max(1, Math.floor(Number(sizeChars)) || 1);
  let overlapCp = Math.max(0, Math.floor(Number(overlapChars)) || 0);
  overlapCp = Math.min(overlapCp, Math.max(0, sizeCp - 1));

  const chunks = [];
  let startCp = 0;
  while (startCp < n) {
    const endCp = Math.min(n, startCp + sizeCp);
    chunks.push(scalars.slice(startCp, endCp).join(""));
    if (endCp === n) break;
    startCp = Math.max(0, endCp - overlapCp);
  }
  return chunks;
}
