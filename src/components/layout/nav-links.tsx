"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TickerSearch } from "@/components/search/ticker-search";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/", label: "Início" },
  { href: "/panorama", label: "Panorama" },
  { href: "/screener", label: "Screener" },
  { href: "/comparar", label: "Comparar" },
  { href: "/projecoes", label: "Projeções" },
  { href: "/carteira", label: "Carteira" },
  { href: "/dados", label: "Dados" },
] as const;

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Navegação com o link ativo destacado (lê a URL). */
export function NavLinks({ variant }: { variant: "desktop" | "mobile" }) {
  return <NavList variant={variant} pathname={usePathname()} />;
}

/** Mesma navegação sem ler a URL — usada como fallback do Suspense. */
export function NavList({ variant, pathname }: { variant: "desktop" | "mobile"; pathname: string | null }) {
  if (variant === "desktop") {
    return (
      <nav aria-label="Principal" className="ml-2 hidden items-center gap-1 lg:flex">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              isActive(pathname, item.href) && "bg-muted font-medium text-foreground",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav aria-label="Principal (celular)" className="flex gap-1 overflow-x-auto border-t px-4 py-1.5 [scrollbar-width:none] lg:hidden">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(pathname, item.href) ? "page" : undefined}
          className={cn("shrink-0 rounded-md px-3 py-1 text-sm text-muted-foreground", isActive(pathname, item.href) && "bg-muted font-medium text-foreground")}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/** Busca no cabeçalho (oculta na página inicial, que tem a busca grande). */
export function HeaderSearch() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return <TickerSearch className="w-36 sm:w-64" />;
}
