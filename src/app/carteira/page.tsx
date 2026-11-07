import type { Metadata } from "next";
import { ComingSoon } from "@/components/common/coming-soon";

export const metadata: Metadata = { title: "Carteira" };

export default function CarteiraPage() {
  return (
    <ComingSoon
      title="Carteira e watchlist"
      description="Acompanhe as empresas que você segue e as suas posições."
      stage="Etapa 5"
    />
  );
}
