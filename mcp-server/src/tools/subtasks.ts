import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { OrgaLifeApiClient } from "../api-client.js";
import { toolHandler } from "../util.js";

export function registerSubtaskTools(
  server: McpServer,
  api: OrgaLifeApiClient
) {
  server.registerTool("add_subtask", {
    title: "Add Subtask",
    description: "Agrega una subtarea a una tarea",
    inputSchema: {
      taskId: z.string().describe("ID de la tarea padre"),
      title: z.string().describe("Título de la subtarea"),
    },
  }, toolHandler(async ({ taskId, title }) => {
    return await api.post(`/api/tasks/${taskId}/subtasks`, { title });
  }));

  server.registerTool("update_subtask", {
    title: "Update Subtask",
    description:
      "Actualiza una subtarea (marcar como hecha, renombrar, reordenar)",
    inputSchema: {
      subtaskId: z.string().describe("ID de la subtarea"),
      title: z.string().optional().describe("Nuevo título"),
      done: z.boolean().optional().describe("Marcar como completada o no"),
      position: z.number().optional().describe("Nueva posición (0-based)"),
    },
  }, toolHandler(async ({ subtaskId, title, done, position }) => {
    const body: Record<string, unknown> = {};
    if (title !== undefined) body.title = title;
    if (done !== undefined) body.done = done;
    if (position !== undefined) body.position = position;
    return await api.patch(`/api/subtasks/${subtaskId}`, body);
  }));

  server.registerTool("delete_subtask", {
    title: "Delete Subtask",
    description: "Elimina una subtarea",
    inputSchema: {
      subtaskId: z.string().describe("ID de la subtarea a eliminar"),
    },
  }, toolHandler(async ({ subtaskId }) => {
    return await api.delete(`/api/subtasks/${subtaskId}`);
  }));
}
