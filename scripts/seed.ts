// Creates an administrator and the demonstration data in an EMPTY database, without
// going through the /setup screen. Meant for local evaluation only: every demo account
// shares a password that is written in the repository.
//
//   pnpm db:seed
//
// With the embedded database, stop `pnpm dev` first (it is single-process).
import { getDb } from "../src/server/db/client";
import { DEMO_PASSWORD, seedDemoData } from "../src/server/seed/demo";
import { countUsers, setupWorkspace } from "../src/server/services/users";

const ADMIN_EMAIL = "admin@demo.barca";

async function main() {
  await getDb();
  if ((await countUsers()) > 0) {
    throw new Error("O banco já tem usuários. O seed só roda em um banco vazio, para não misturar dados de exemplo com dados reais.");
  }
  const adminId = await setupWorkspace({ name: "Admin Demo", email: ADMIN_EMAIL, password: DEMO_PASSWORD });
  await seedDemoData(adminId);
  console.log("Dados de demonstração criados.");
  console.log(`Entre com ${ADMIN_EMAIL} e a senha ${DEMO_PASSWORD}.`);
  console.log("As outras contas de exemplo (ex.: marina@demo.barca, diego@demo.barca) usam a mesma senha.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
