import { callKnowledgeFlowTool, listKnowledgeFlowTools } from "./tools.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

export function createKnowledgeFlowMcpServer() {
  const server = new Server(
    { name: "joplin-llm-wiki", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: listKnowledgeFlowTools(),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await callKnowledgeFlowTool(
      request.params.name,
      request.params.arguments ?? {},
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result),
        },
      ],
      isError: !result.ok,
    };
  });
  return server;
}

export async function main() {
  const server = createKnowledgeFlowMcpServer();
  await server.connect(new StdioServerTransport());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
