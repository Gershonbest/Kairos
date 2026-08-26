// Quiet time-mark loader for page and panel waiting states.

import { cn } from "../ui/utils";

type BrandLoaderProps = {
  label?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  fullscreen?: boolean;
};

export function BrandLoader({
  label = "Loading",
  className = "",
  size = "md",
  fullscreen = false,
}: BrandLoaderProps) {
  return (
    <div
      className={cn(
        "flex w-full items-center justify-center",
        fullscreen ? "min-h-[60vh]" : "py-8",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="brand-loader-wrap">
        <div className="brand-loader-orbit" data-size={size}>
          <svg viewBox="0 0 64 64" className="brand-loader-svg" aria-hidden="true">
            <circle className="brand-loader-track" cx="32" cy="32" r="24" />
            <circle className="brand-loader-core" cx="32" cy="32" r="3.4" />
            <g className="brand-loader-rotor">
              <circle
                className="brand-loader-tail"
                cx="32"
                cy="32"
                r="24"
                pathLength="100"
                transform="rotate(-90 32 32)"
              />
              <circle className="brand-loader-head" cx="32" cy="8" r="3.15" />
            </g>
          </svg>
        </div>
        <p className="brand-loader-text">{label}</p>
      </div>
    </div>
  );
}
