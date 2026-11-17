import { connection } from "next/server";
import { countUsers } from "@/server/services/users";

/** Liveness and database check for load balancers and uptime monitors. */
export async function GET() {
  await connection();
  try {
    await countUsers();
    return Response.json({ status: "ok" });
  } catch (error) {
    console.error("[health] banco indisponível:", error);
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
