"use client";

import { ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      title="Algo deu errado ao carregar esta página"
      description={error.digest ? `Código do erro: ${error.digest}` : error.message}
      action={
        <Button variant="outline" onClick={reset}>
          Tentar novamente
        </Button>
      }
    />
  );
}
