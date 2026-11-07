"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme";

export const NAV_ITEMS = [
  { href: "/", label: "Início" },
  { href: "/screener", label: "Screener" },
  { href: "/comparar", label: "Comparar" },
  { href: "/carteira", label: "Carteira" },
  { href: "/dados", label: "Dados" },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/logo-icon.svg" alt="" width={26} height={26} className="rounded-md" />
          <span className="hidden sm:inline">Fundamental Copilot</span>
          <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">BR</span>
        </Link>

        <nav aria-label="Principal" className="ml-2 hidden items-center gap-1 md:flex">
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

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
        </div>
      </div>

      {/* Navegação no celular: faixa rolável sob o cabeçalho */}
      <nav aria-label="Principal (celular)" className="flex gap-1 overflow-x-auto border-t px-4 py-1.5 md:hidden">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-md px-3 py-1 text-sm text-muted-foreground",
              isActive(pathname, item.href) && "bg-muted font-medium text-foreground",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
