#!/usr/bin/env node
import { main } from "../src/mcp/server.js";

try {
  await main();
} catch (err) {
  console.error(err);
  process.exit(3);
}
