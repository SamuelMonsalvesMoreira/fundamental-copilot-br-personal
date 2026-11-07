import Link from "next/link";
import { SearchXIcon } from "lucide-react";
import { EmptyState } from "@/components/common/states";

export default function NotFound() {
  return (
    <EmptyState
      icon={SearchXIcon}
      title="Página não encontrada"
      description="Confira o endereço ou volte para o início."
      action={
        <Link href="/" className="text-sm font-medium underline-offset-4 hover:underline">
          Ir para o início
        </Link>
      }
    />
  );
}
