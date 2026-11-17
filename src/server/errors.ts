export type AppErrorCode = "unauthorized" | "forbidden" | "not_found" | "invalid" | "conflict";

/** An expected failure whose message is safe to show to the person who caused it. */
export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const forbidden = (message = "Você não tem permissão para fazer isso.") => new AppError("forbidden", message);
export const notFound = (message = "Não encontrado.") => new AppError("not_found", message);
export const invalid = (message: string) => new AppError("invalid", message);
export const conflict = (message: string) => new AppError("conflict", message);

export const HTTP_STATUS: Record<AppErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid: 400,
  conflict: 409,
};
