// prisma/generate.mjs — sets the datasource provider based on DATABASE_PROVIDER
// then runs prisma generate. Prisma forbids env() in the provider field, so we
// rewrite it to a literal before generating.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const provider = process.env.DATABASE_PROVIDER === "postgresql" ? "postgresql" : "sqlite";
const schemaPath = path.join(process.cwd(), "prisma", "schema.prisma");
let schema = fs.readFileSync(schemaPath, "utf8");

schema = schema.replace(
  /provider\s*=\s*(env\("DATABASE_PROVIDER"\)|"sqlite"|"postgresql")(\s*\/\/.*)?/,
  `provider = "${provider}" // swapped by prisma/generate.mjs`
);

fs.writeFileSync(schemaPath, schema);
console.log(`[prisma] datasource provider set to "${provider}"`);

execSync("prisma generate", { stdio: "inherit" });
