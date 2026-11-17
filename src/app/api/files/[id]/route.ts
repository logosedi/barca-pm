import { getCurrentUser } from "@/server/auth/session";
import { readImage } from "@/server/services/files";

/** Serves an uploaded image to signed-in users only. */
export async function GET(_request: Request, context: RouteContext<"/api/files/[id]">) {
  if (!(await getCurrentUser())) return new Response("Não autenticado.", { status: 401 });
  const { id } = await context.params;
  const image = await readImage(id);
  if (!image) return new Response("Imagem não encontrada.", { status: 404 });
  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "content-type": image.mimeType,
      // Files are immutable (the id never points to different bytes) and private.
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
    },
  });
}
