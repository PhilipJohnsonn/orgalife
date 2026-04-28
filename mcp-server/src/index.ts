import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { OrgaLifeApiClient } from "./api-client.js";
import { registerBoardTools } from "./tools/boards.js";
import { registerColumnTools } from "./tools/columns.js";
import { registerTaskTools } from "./tools/tasks.js";
import { registerSubtaskTools } from "./tools/subtasks.js";
import { registerTagTools } from "./tools/tags.js";

const server = new McpServer({
  name: "orgalife",
  version: "1.0.0",
});

const api = new OrgaLifeApiClient();

registerBoardTools(server, api);
registerColumnTools(server, api);
registerTaskTools(server, api);
registerSubtaskTools(server, api);
registerTagTools(server, api);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("OrgaLife MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
