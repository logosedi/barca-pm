import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/server/mcp/server";
import { authenticateApiToken } from "@/server/services/tokens";

// MCP over Streamable HTTP, stateless: each POST carries a JSON-RPC message and gets a
// JSON answer. No session is kept, so any instance of the app can serve any request.

const jsonRpcError = (status: number, message: string, headers?: HeadersInit) =>
  Response.json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }, { status, headers });

export async function POST(request: Request) {
  const auth = await authenticateApiToken(request.headers.get("authorization"));
  if (!auth) {
    return jsonRpcError(401, "Token ausente, inválido ou revogado. Crie um em Configurações > Tokens de acesso.", {
      "www-authenticate": "Bearer",
    });
  }
  const server = createMcpServer(auth.actor, auth.scope);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

// The server never pushes messages on its own, so there is no SSE stream to open.
const methodNotAllowed = () => jsonRpcError(405, "Use POST.", { allow: "POST" });
export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
