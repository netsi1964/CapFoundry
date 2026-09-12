/**
 * Minimal JSON-RPC 2.0 over stdio for MCP.
 *
 * Hand-rolled rather than pulled from the SDK because the surface CFCM needs
 * is initialize + tools/list + tools/call, and a dependency-free server starts
 * in milliseconds. Startup latency is charged directly against OBJ-3.
 */

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export const ERROR_CODES = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
} as const;

/** Reads newline-delimited JSON-RPC messages from a byte stream. */
export async function* readMessages(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<JsonRpcRequest | { __parseError: string }> {
  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line === "") continue;
      try {
        yield JSON.parse(line) as JsonRpcRequest;
      } catch (err) {
        yield { __parseError: (err as Error).message };
      }
    }
  }
}

export function writeMessage(response: JsonRpcResponse): Promise<number> {
  return Deno.stdout.write(new TextEncoder().encode(`${JSON.stringify(response)}\n`));
}
