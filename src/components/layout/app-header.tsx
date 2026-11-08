import Link from "next/link";
import { Suspense } from "react";
import { HeaderSearch, NavLinks, NavList } from "./nav-links";
import { ThemeToggle } from "./theme";

/**
 * Cabeçalho fixo. As partes que dependem da URL (link ativo, busca) ficam
 * em componentes cliente dentro de <Suspense>, para não bloquear o
 * pré-render das rotas dinâmicas.
 */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b print:hidden bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/logo-icon.svg" alt="" width={26} height={26} className="rounded-md" />
          <span className="hidden sm:inline">Fundamental Copilot</span>
          <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">BR</span>
        </Link>

        <Suspense fallback={<NavList variant="desktop" pathname={null} />}>
          <NavLinks variant="desktop" />
        </Suspense>

        <div className="ml-auto flex min-w-0 items-center gap-1">
          <Suspense fallback={null}>
            <HeaderSearch />
          </Suspense>
          <ThemeToggle />
        </div>
      </div>

      <Suspense fallback={<NavList variant="mobile" pathname={null} />}>
        <NavLinks variant="mobile" />
      </Suspense>
    </header>
  );
}
