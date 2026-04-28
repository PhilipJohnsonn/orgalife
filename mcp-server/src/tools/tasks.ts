import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { OrgaLifeApiClient } from "../api-client.js";
import { toolHandler } from "../util.js";

export function registerTaskTools(server: McpServer, api: OrgaLifeApiClient) {
  server.registerTool("create_task", {
    title: "Create Task",
    description: "Crea una nueva tarea en una columna",
    inputSchema: {
      columnId: z.string().describe("ID de la columna donde crear la tarea"),
      title: z.string().describe("Título de la tarea"),
      description: z.string().optional().describe("Descripción de la tarea"),
      priority: z
        .enum(["low", "medium", "high"])
        .optional()
        .describe("Prioridad (default: medium)"),
      dueDate: z
        .string()
        .optional()
        .describe("Fecha límite en formato ISO 8601 (ej: 2026-04-20)"),
    },
  }, toolHandler(async ({ columnId, title, description, priority, dueDate }) => {
    return await api.post("/api/tasks", {
      columnId,
      title,
      description,
      priority,
      dueDate,
    });
  }));

  server.registerTool("get_task", {
    title: "Get Task",
    description:
      "Obtiene el detalle de una tarea con sus subtareas y tags",
    inputSchema: {
      taskId: z.string().describe("ID de la tarea"),
    },
  }, toolHandler(async ({ taskId }) => {
    return await api.get(`/api/tasks/${taskId}`);
  }));

  server.registerTool("update_task", {
    title: "Update Task",
    description:
      "Actualiza campos de una tarea (título, descripción, prioridad, fecha, tags)",
    inputSchema: {
      taskId: z.string().describe("ID de la tarea"),
      title: z.string().optional().describe("Nuevo título"),
      description: z.string().optional().describe("Nueva descripción"),
      priority: z
        .enum(["low", "medium", "high"])
        .optional()
        .describe("Nueva prioridad"),
      dueDate: z
        .string()
        .nullable()
        .optional()
        .describe("Nueva fecha límite (ISO 8601) o null para eliminarla"),
      tagIds: z
        .array(z.string())
        .optional()
        .describe("Lista de IDs de tags a asignar (reemplaza los actuales)"),
    },
  }, toolHandler(async ({ taskId, title, description, priority, dueDate, tagIds }) => {
    const body: Record<string, unknown> = {};
    if (title !== undefined) body.title = title;
    if (description !== undefined) body.description = description;
    if (priority !== undefined) body.priority = priority;
    if (dueDate !== undefined) body.dueDate = dueDate;
    if (tagIds !== undefined) body.tagIds = tagIds;
    return await api.patch(`/api/tasks/${taskId}`, body);
  }));

  server.registerTool("move_task", {
    title: "Move Task",
    description: "Mueve una tarea a otra columna",
    inputSchema: {
      taskId: z.string().describe("ID de la tarea a mover"),
      columnId: z
        .string()
        .describe("ID de la columna destino"),
      position: z
        .number()
        .optional()
        .describe("Posición en la columna destino (0-based, default: al final)"),
    },
  }, toolHandler(async ({ taskId, columnId, position }) => {
    const body: Record<string, unknown> = { columnId };
    if (position !== undefined) body.position = position;
    return await api.patch(`/api/tasks/${taskId}`, body);
  }));

  server.registerTool("delete_task", {
    title: "Delete Task",
    description: "Elimina una tarea",
    inputSchema: {
      taskId: z.string().describe("ID de la tarea a eliminar"),
    },
  }, toolHandler(async ({ taskId }) => {
    return await api.delete(`/api/tasks/${taskId}`);
  }));
}
