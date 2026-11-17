import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { requireActor } from "@/server/auth/session";
import { invalid } from "@/server/errors";
import { errorResponse, isSameOrigin } from "@/server/http";
import { saveImage } from "@/server/services/files";

/** Receives an image pasted or dropped into a Markdown field and returns its URL. */
export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return Response.json({ error: "Origem não permitida." }, { status: 403 });
    const actor = await requireActor();
    if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 64 * 1024) {
      throw invalid("A imagem passa do limite de 10 MB.");
    }
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) throw invalid("Nenhum arquivo enviado.");
    const saved = await saveImage(actor, { filename: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    return Response.json(saved, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
