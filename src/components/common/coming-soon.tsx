import { HammerIcon } from "lucide-react";
import { PageHeader } from "./page-header";
import { EmptyState } from "./states";

/** Página reservada para uma funcionalidade de uma etapa futura. */
export function ComingSoon({ title, description, stage }: { title: string; description: string; stage: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <EmptyState icon={HammerIcon} title={`Em construção — ${stage}`} description="Esta tela ainda não tem dados." />
    </>
  );
}
