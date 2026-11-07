import Link from "next/link";
import { ArrowRightIcon, BarChart3Icon, BotIcon, DatabaseIcon, ScaleIcon } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const PILLARS = [
  {
    icon: DatabaseIcon,
    title: "Dados oficiais e atuais",
    text: "Demonstrações da CVM (DFP e ITR), Selic, IPCA e CDI do Banco Central, cotações e proventos da brapi.dev — com a fonte e a data em cada número.",
  },
  {
    icon: BarChart3Icon,
    title: "Indicadores e histórico",
    text: "P/L, P/VP, EV/EBITDA, ROE, ROIC, margens, endividamento, dividendos e CAGR, com até 10 anos de histórico.",
  },
  {
    icon: ScaleIcon,
    title: "Valuation",
    text: "Graham, Bazin e DCF com premissas editáveis, além da comparação com os pares do setor.",
  },
  {
    icon: BotIcon,
    title: "Copiloto com IA",
    text: "Perguntas e relatórios respondidos com base nos números reais do banco, citando período e fonte.",
  },
];

export default function Home() {
  return (
    <div className="grid gap-10">
      <section className="grid gap-3 pt-4">
        <p className="text-sm font-medium text-primary">Análise fundamentalista · B3</p>
        <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Ações brasileiras analisadas a partir dos números publicados.
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          A busca por ticker e a página de cada empresa chegam nas próximas etapas. Por enquanto, veja o estado do
          banco local em{" "}
          <Link href="/dados" className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline">
            Dados <ArrowRightIcon className="size-3.5" />
          </Link>
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {PILLARS.map(({ icon: Icon, title, text }) => (
          <Card key={title}>
            <CardHeader>
              <Icon className="size-5 text-primary" aria-hidden />
              <CardTitle className="mt-2">{title}</CardTitle>
              <CardDescription>{text}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>
    </div>
  );
}
