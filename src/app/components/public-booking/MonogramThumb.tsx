// Thumbnail with image or initials monogram fallback.

type MonogramThumbProps = {
  name: string;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeClass = {
  sm: "h-12 w-12 text-xs",
  md: "h-16 w-16 text-sm",
  lg: "h-20 w-20 text-base",
} as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function MonogramThumb({ name, imageUrl, size = "md", className = "" }: MonogramThumbProps) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        className={`shrink-0 rounded-xl object-cover ${sizeClass[size]} ${className}`}
      />
    );
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-xl bg-slate-900/90 font-semibold tracking-wide text-emerald-300 ${sizeClass[size]} ${className}`}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}
