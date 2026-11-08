"use client";

import { useState, useSyncExternalStore } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface TabDef {
  value: string;
  label: string;
  content: React.ReactNode;
}

/** Abas da página da empresa; a aba ativa fica no #hash (link compartilhável). */
export function CompanyTabs({ tabs }: { tabs: TabDef[] }) {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash.slice(1), () => "");
  const [picked, setPicked] = useState<string | null>(null);
  const value = picked ?? (tabs.some((t) => t.value === hash) ? hash : tabs[0]?.value);

  return (
    <Tabs
      className="min-w-0"
      value={value}
      onValueChange={(v) => {
        setPicked(String(v));
        history.replaceState(null, "", `#${v}`);
      }}
    >
      <div className="-mx-4 overflow-x-auto overflow-y-hidden border-b px-4 pb-px [scrollbar-width:none] sm:mx-0 sm:px-0">
        <TabsList variant="line" className="h-10">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="px-3">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {tabs.map((t) => (
        <TabsContent key={t.value} value={t.value} className="pt-5">
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}

function subscribeHash(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}
