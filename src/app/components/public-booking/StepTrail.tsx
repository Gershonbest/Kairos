// Thin text trail + progress bar for the public booking flow.

type StepTrailProps = {
  labels: string[];
  activeIndex: number;
};

export function StepTrail({ labels, activeIndex }: StepTrailProps) {
  const progress = labels.length <= 1 ? 100 : (activeIndex / (labels.length - 1)) * 100;

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
        {labels.map((label, i) => {
          const done = i < activeIndex;
          const active = i === activeIndex;
          return (
            <span key={label} className="inline-flex items-center gap-2">
              {i > 0 && <span className="text-muted-foreground/50">·</span>}
              <span
                className={
                  active
                    ? "font-semibold text-foreground"
                    : done
                      ? "font-medium text-primary"
                      : "text-muted-foreground"
                }
              >
                {label}
              </span>
            </span>
          );
        })}
      </div>
      <div className="mt-3 h-[2px] w-full overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-400 ease-out"
          style={{ width: `${Math.max(8, progress)}%` }}
        />
      </div>
    </div>
  );
}
