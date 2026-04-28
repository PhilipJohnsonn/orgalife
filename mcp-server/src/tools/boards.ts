import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { OrgaLifeApiClient } from "../api-client.js";
import { toolHandler } from "../util.js";

export function registerBoardTools(server: McpServer, api: OrgaLifeApiClient) {
  server.registerTool("list_boards", {
    title: "List Boards",
    description:
      "Lista todos los boards con sus columnas, tareas, subtareas y tags",
  }, toolHandler(async () => {
    return await api.get("/api/boards");
  }));

  server.registerTool("get_board", {
    title: "Get Board",
    description: "Obtiene un board con todas sus columnas, tareas y subtareas",
    inputSchema: {
      boardId: z.string().describe("ID del board"),
    },
  }, toolHandler(async ({ boardId }) => {
    return await api.get(`/api/boards/${boardId}`);
  }));

  server.registerTool("create_board", {
    title: "Create Board",
    description:
      "Crea un nuevo board con columnas por defecto (To Do, In Progress, Done)",
    inputSchema: {
      name: z.string().describe("Nombre del board"),
    },
  }, toolHandler(async ({ name }) => {
    return await api.post("/api/boards", { name });
  }));

  server.registerTool("update_board", {
    title: "Update Board",
    description: "Renombra un board",
    inputSchema: {
      boardId: z.string().describe("ID del board"),
      name: z.string().describe("Nuevo nombre del board"),
    },
  }, toolHandler(async ({ boardId, name }) => {
    return await api.patch(`/api/boards/${boardId}`, { name });
  }));

  server.registerTool("delete_board", {
    title: "Delete Board",
    description: "Elimina un board y todo su contenido (columnas, tareas, etc)",
    inputSchema: {
      boardId: z.string().describe("ID del board a eliminar"),
    },
  }, toolHandler(async ({ boardId }) => {
    return await api.delete(`/api/boards/${boardId}`);
  }));
}
