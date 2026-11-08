import { SearchXIcon } from "lucide-react";
import { EmptyState } from "@/components/common/states";
import { TickerSearch } from "@/components/search/ticker-search";

export default function TickerNotFound() {
  return (
    <EmptyState
      icon={SearchXIcon}
      title="Ticker não encontrado"
      description="Esse código não está entre as ações listadas na B3 segundo o cadastro da CVM. Confira a grafia ou busque pelo nome da empresa."
      action={<TickerSearch size="lg" className="w-80 max-w-full" autoFocus />}
    />
  );
}
