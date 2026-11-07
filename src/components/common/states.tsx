import { AlertTriangleIcon, DatabaseIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StateProps {
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}

/** Quando não há dado: deixa claro que falta, em vez de mostrar zero. */
export function EmptyState({ title, description, icon: Icon = DatabaseIcon, action, className }: StateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center",
        className,
      )}
    >
      <Icon className="size-6 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      {description && <div className="max-w-md text-sm text-muted-foreground">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ title, description, icon: Icon = AlertTriangleIcon, action, className }: StateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center",
        className,
      )}
    >
      <Icon className="size-6 text-destructive" aria-hidden />
      <p className="font-medium">{title}</p>
      {description && <div className="max-w-md text-sm text-muted-foreground">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
