/** Carrega .env.local (e .env) para scripts executados fora do Next. */
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
