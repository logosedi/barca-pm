import { notFound } from "next/navigation";
import { AppError } from "./errors";

/**
 * For pages: turns "not found" and "forbidden" from the service layer into the 404
 * page, so a screen the user may not see looks the same as one that does not exist.
 */
export async function orNotFound<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (error instanceof AppError && (error.code === "not_found" || error.code === "forbidden")) notFound();
    throw error;
  }
}
