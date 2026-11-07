"use client";

import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // Rótulo fixo: o tema só é conhecido no navegador, e um rótulo dinâmico
  // causaria diferença entre o HTML do servidor e o do cliente.
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Alternar modo claro/escuro"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <SunIcon className="hidden dark:block" />
      <MoonIcon className="dark:hidden" />
    </Button>
  );
}
