import type { Metadata } from "next";
import { ComingSoon } from "@/components/common/coming-soon";

export const metadata: Metadata = { title: "Comparar empresas" };

export default function CompararPage() {
  return (
    <ComingSoon
      title="Comparar empresas"
      description="Compare de 2 a 4 empresas lado a lado: indicadores, histórico e valuation."
      stage="Etapa 5"
    />
  );
}
