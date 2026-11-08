import { Skeleton } from "@/components/ui/skeleton";

export function CompanyPageSkeleton() {
  return (
    <div className="grid gap-5" aria-busy="true" aria-label="Carregando empresa">
      <div className="flex items-end justify-between border-b pb-5">
        <div className="flex gap-3">
          <Skeleton className="size-11 rounded-lg" />
          <div className="grid gap-2">
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
        <div className="grid justify-items-end gap-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
      <Skeleton className="h-9 w-full max-w-lg" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 14 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    </div>
  );
}
