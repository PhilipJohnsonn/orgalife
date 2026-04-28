import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Wraps a tool handler function to catch errors and return them
 * as MCP error results instead of crashing the server.
 */
export function toolHandler<T>(
  fn: (args: T) => Promise<unknown>
): (args: T) => Promise<CallToolResult> {
  return async (args: T): Promise<CallToolResult> => {
    try {
      const result = await fn(args);
      return {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  };
}
