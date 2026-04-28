import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { OrgaLifeApiClient } from "../api-client.js";
import { toolHandler } from "../util.js";

export function registerColumnTools(
  server: McpServer,
  api: OrgaLifeApiClient
) {
  server.registerTool("create_column", {
    title: "Create Column",
    description: "Agrega una nueva columna a un board",
    inputSchema: {
      boardId: z.string().describe("ID del board"),
      name: z.string().describe("Nombre de la columna"),
    },
  }, toolHandler(async ({ boardId, name }) => {
    return await api.post("/api/columns", { boardId, name });
  }));

  server.registerTool("update_column", {
    title: "Update Column",
    description: "Renombra o reordena una columna",
    inputSchema: {
      columnId: z.string().describe("ID de la columna"),
      name: z.string().optional().describe("Nuevo nombre"),
      position: z.number().optional().describe("Nueva posición (0-based)"),
    },
  }, toolHandler(async ({ columnId, name, position }) => {
    const body: Record<string, unknown> = {};
    if (name !== undefined) body.name = name;
    if (position !== undefined) body.position = position;
    return await api.patch(`/api/columns/${columnId}`, body);
  }));

  server.registerTool("delete_column", {
    title: "Delete Column",
    description: "Elimina una columna y todas sus tareas",
    inputSchema: {
      columnId: z.string().describe("ID de la columna a eliminar"),
    },
  }, toolHandler(async ({ columnId }) => {
    return await api.delete(`/api/columns/${columnId}`);
  }));
}
