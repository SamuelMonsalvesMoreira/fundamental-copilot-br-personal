import type { Metadata } from "next";
import { ComingSoon } from "@/components/common/coming-soon";

export const metadata: Metadata = { title: "Screener" };

export default function ScreenerPage() {
  return (
    <ComingSoon
      title="Screener"
      description="Filtre ações por ROE, P/L, dividend yield, margens, endividamento e mais."
      stage="Etapa 5"
    />
  );
}
