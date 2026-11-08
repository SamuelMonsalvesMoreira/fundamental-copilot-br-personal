/** Site público: banco só leitura, sem carteira, sem chat e sem salvar no servidor. */
export const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "1";
