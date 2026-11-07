import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppHeader } from "@/components/layout/app-header";
import { ThemeProvider } from "@/components/layout/theme";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Fundamental Copilot BR", template: "%s · Fundamental Copilot BR" },
  description: "Análise fundamentalista de ações brasileiras com dados oficiais da CVM, Banco Central e cotações atualizadas.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <TooltipProvider>
            <AppHeader />
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">{children}</main>
            <footer className="border-t">
              <div className="mx-auto max-w-7xl px-4 py-5 text-xs text-muted-foreground sm:px-6">
                Ferramenta de estudo. As informações e análises exibidas não constituem recomendação de
                investimento. Dados: CVM Dados Abertos, Banco Central do Brasil (SGS) e brapi.dev.
              </div>
            </footer>
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
