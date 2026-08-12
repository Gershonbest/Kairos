// Branded animated loader used for tab/page loading states.

type BrandLoaderProps = {
  label?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  fullscreen?: boolean;
};

const sizeMap = {
  sm: "h-14 w-14",
  md: "h-20 w-20",
  lg: "h-28 w-28",
} as const;

export function BrandLoader({
  label = "Loading",
  className = "",
  size = "md",
  fullscreen = false,
}: BrandLoaderProps) {
  const containerClass = fullscreen
    ? "flex min-h-[60vh] w-full items-center justify-center"
    : "flex w-full items-center justify-center py-8";

  return (
    <div className={`${containerClass} ${className}`}>
      <div className="brand-loader-wrap">
        <div className={`brand-loader-orbit ${sizeMap[size]}`}>
          <span className="brand-flow-ring" aria-label="Loading" />
          <span className="brand-flow-ring brand-flow-ring-trail" aria-hidden />
        </div>
        <p className="brand-loader-text">{label}</p>
      </div>
    </div>
  );
}
