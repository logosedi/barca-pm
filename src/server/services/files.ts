import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import type { Actor } from "@/lib/permissions";
import { getDb } from "../db/client";
import { files } from "../db/schema";
import { invalid } from "../errors";

// Images pasted into descriptions and comments. Bytes live on local disk behind this
// small module so that swapping in S3-compatible storage later only touches this file.

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), ".data", "uploads");

// The folder is only known at runtime; the comment keeps the bundler from trying to
// trace (and ship) whatever it could point to.
const filePath = (id: string) => path.join(/* turbopackIgnore: true */ UPLOAD_DIR, id);

/**
 * Detects the image type from its first bytes. The browser-declared type is not
 * trusted: a file is only stored (and later served) as what it really is.
 */
export function sniffImageType(bytes: Uint8Array): string | null {
  const startsWith = (signature: number[], offset = 0) => signature.every((byte, i) => bytes[offset + i] === byte);
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

export async function saveImage(actor: Actor, input: { filename: string; bytes: Uint8Array }) {
  if (input.bytes.byteLength === 0) throw invalid("O arquivo está vazio.");
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) throw invalid("A imagem passa do limite de 10 MB.");
  const mimeType = sniffImageType(input.bytes);
  if (!mimeType) throw invalid("Formato não suportado. Envie PNG, JPEG, GIF ou WebP.");

  const db = await getDb();
  const [file] = await db
    .insert(files)
    .values({
      uploaderId: actor.id,
      filename: input.filename.slice(0, 200) || "imagem",
      mimeType,
      size: input.bytes.byteLength,
    })
    .returning({ id: files.id });
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(filePath(file.id), input.bytes);
  return { id: file.id, url: `/api/files/${file.id}` };
}

export async function readImage(fileId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) return null;
  const db = await getDb();
  const [file] = await db.select().from(files).where(eq(files.id, fileId));
  if (!file) return null;
  try {
    return { mimeType: file.mimeType, bytes: await fs.readFile(filePath(file.id)) };
  } catch {
    return null;
  }
}
