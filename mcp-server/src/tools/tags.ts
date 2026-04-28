import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { OrgaLifeApiClient } from "../api-client.js";
import { toolHandler } from "../util.js";

export function registerTagTools(server: McpServer, api: OrgaLifeApiClient) {
  server.registerTool("list_tags", {
    title: "List Tags",
    description: "Lista todos los tags disponibles",
  }, toolHandler(async () => {
    return await api.get("/api/tags");
  }));

  server.registerTool("create_tag", {
    title: "Create Tag",
    description: "Crea un nuevo tag",
    inputSchema: {
      name: z.string().describe("Nombre del tag"),
      color: z
        .string()
        .optional()
        .describe("Color en hexadecimal (ej: #FF5733, default: #6B7280)"),
    },
  }, toolHandler(async ({ name, color }) => {
    return await api.post("/api/tags", { name, color });
  }));

  server.registerTool("update_tag", {
    title: "Update Tag",
    description: "Actualiza el nombre o color de un tag",
    inputSchema: {
      tagId: z.string().describe("ID del tag"),
      name: z.string().optional().describe("Nuevo nombre"),
      color: z.string().optional().describe("Nuevo color en hexadecimal"),
    },
  }, toolHandler(async ({ tagId, name, color }) => {
    const body: Record<string, unknown> = {};
    if (name !== undefined) body.name = name;
    if (color !== undefined) body.color = color;
    return await api.patch(`/api/tags/${tagId}`, body);
  }));

  server.registerTool("delete_tag", {
    title: "Delete Tag",
    description: "Elimina un tag",
    inputSchema: {
      tagId: z.string().describe("ID del tag a eliminar"),
    },
  }, toolHandler(async ({ tagId }) => {
    return await api.delete(`/api/tags/${tagId}`);
  }));
}
