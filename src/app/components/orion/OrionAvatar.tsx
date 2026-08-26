import { useId, type ComponentProps } from "react";
import { cn } from "../ui/utils";

type OrionAvatarProps = {
  size?: "xs" | "sm" | "md" | "lg";
  pulse?: boolean;
  className?: string;
};

const sizePx = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
} as const;

/** Minimal Orion constellation mark — dark field, emerald belt star. */
export function OrionAvatar({ size = "md", pulse = false, className }: OrionAvatarProps) {
  const px = sizePx[size];
  const glowId = useId().replace(/:/g, "");

  return (
    <div
      className={cn(
        "relative shrink-0 rounded-full",
        "bg-[#0b1220] border border-primary/25",
        "shadow-[0_8px_24px_-8px_rgba(15,23,42,0.55),inset_0_1px_0_rgba(255,255,255,0.06)]",
        pulse && "orion-avatar-pulse",
        className,
      )}
      style={{ width: px, height: px }}
      aria-hidden
    >
      <svg
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-[12%] h-[76%] w-[76%]"
      >
        <defs>
          <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.2" />
          </radialGradient>
        </defs>
        {/* Constellation lines */}
        <g stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" className="text-slate-500/45">
          <path d="M14 13 L18 24 L16 35" />
          <path d="M34 15 L30 24 L32 37" />
          <path d="M18 24 L24 23 L30 24" />
        </g>
        {/* Shoulders */}
        <circle cx="14" cy="13" r="1.6" className="fill-slate-300/90" />
        <circle cx="34" cy="15" r="1.5" className="fill-slate-400/80" />
        {/* Belt — center star is the accent */}
        <circle cx="18" cy="24" r="1.4" className="fill-slate-300/85" />
        <circle cx="24" cy="23" r="2.2" fill={`url(#${glowId})`} />
        <circle cx="30" cy="24" r="1.4" className="fill-slate-300/85" />
        {/* Legs */}
        <circle cx="16" cy="35" r="1.3" className="fill-slate-400/70" />
        <circle cx="32" cy="37" r="1.5" className="fill-slate-300/75" />
      </svg>
      <span className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/5" />
    </div>
  );
}

export function OrionAvatarButton({
  pulse = true,
  className,
  ...props
}: ComponentProps<"button"> & { pulse?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "group relative flex items-center justify-center rounded-full p-0",
        "transition-transform duration-200 hover:scale-[1.03] active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "cursor-grab active:cursor-grabbing",
        className,
      )}
    >
      <OrionAvatar size="lg" pulse={pulse} />
      <span className="pointer-events-none absolute -bottom-0.5 left-1/2 -translate-x-1/2 rounded-full bg-card px-1.5 py-px text-[9px] font-semibold tracking-wide text-foreground shadow-sm border border-border/80 opacity-0 group-hover:opacity-100 transition-opacity">
        Orion
      </span>
    </button>
  );
}
