/**
 * @param {{
 *   persistPath: string,
 *   sourcesCollection: string,
 *   wikiCollection: string,
 *   host?: string,
 *   port?: number,
 * }} opts
 */
export async function createVectorStore(opts) {
  if (process.env.JOPLIN_BRAIN_TEST_MEMORY_VECTOR === "1") {
    const { MemoryVectorStore } = await import("./memory-vector-store.js");
    return new MemoryVectorStore(opts);
  }
  const { ChromaStore } = await import("./chroma-store.js");
  return new ChromaStore(opts);
}
