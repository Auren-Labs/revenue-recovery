export const MetricCardSkeleton = () => (
  <div className="rounded-2xl border border-border p-5 space-y-3 animate-pulse">
    <div className="flex items-start justify-between">
      <div className="flex-1 space-y-2">
        <div className="h-3 w-24 bg-secondary rounded" />
        <div className="h-8 w-32 bg-secondary rounded" />
      </div>
      <div className="h-10 w-10 rounded-xl bg-secondary" />
    </div>
    <div className="flex items-center justify-between">
      <div className="h-3 w-20 bg-secondary rounded" />
      <div className="h-3 w-16 bg-secondary rounded" />
    </div>
  </div>
);

export const ChartSkeleton = () => (
  <div className="rounded-3xl border border-border bg-card/90 p-6 space-y-4 animate-pulse">
    <div className="space-y-2">
      <div className="h-4 w-32 bg-secondary rounded" />
      <div className="h-6 w-48 bg-secondary rounded" />
    </div>
    <div className="h-72 bg-secondary/30 rounded-xl" />
  </div>
);

export const DiscrepancySkeleton = () => (
  <div className="py-4 space-y-3 animate-pulse">
    <div className="flex items-center gap-4">
      <div className="flex-1 space-y-2">
        <div className="h-4 w-48 bg-secondary rounded" />
        <div className="h-3 w-64 bg-secondary rounded" />
      </div>
      <div className="h-4 w-20 bg-secondary rounded" />
    </div>
    <div className="flex gap-2">
      <div className="h-8 w-24 bg-secondary rounded-lg" />
      <div className="h-8 w-24 bg-secondary rounded-lg" />
      <div className="h-8 w-24 bg-secondary rounded-lg" />
    </div>
  </div>
);

export const DashboardSkeleton = () => (
  <div className="space-y-10">
    {/* Header Skeleton */}
    <div className="flex justify-between items-start animate-pulse">
      <div className="space-y-3">
        <div className="h-4 w-32 bg-secondary rounded" />
        <div className="h-10 w-64 bg-secondary rounded" />
        <div className="h-4 w-96 bg-secondary rounded" />
      </div>
      <div className="flex gap-3">
        <div className="h-10 w-32 bg-secondary rounded-lg" />
        <div className="h-10 w-32 bg-secondary rounded-lg" />
      </div>
    </div>

    {/* Metric Cards Skeleton */}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <MetricCardSkeleton key={i} />
      ))}
    </div>

    {/* Charts Skeleton */}
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <ChartSkeleton />
      </div>
      <ChartSkeleton />
    </div>

    {/* Discrepancies Skeleton */}
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 rounded-3xl border border-border bg-card/90 p-6 space-y-4 animate-pulse">
        <div className="h-6 w-48 bg-secondary rounded" />
        <div className="divide-y divide-border/60">
          {Array.from({ length: 3 }).map((_, i) => (
            <DiscrepancySkeleton key={i} />
          ))}
        </div>
      </div>
      <div className="rounded-3xl border border-border bg-card/90 p-6 space-y-4 animate-pulse">
        <div className="h-6 w-32 bg-secondary rounded" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className="w-2 h-2 rounded-full bg-secondary mt-2" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 bg-secondary rounded" />
              <div className="h-3 w-full bg-secondary rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

