// Compact live analog clock with accessible digital readout.

import { useEffect, useMemo, useState } from "react";

type LiveAnalogClockProps = {
  className?: string;
};

function padTime(value: number): string {
  return String(value).padStart(2, "0");
}

export function LiveAnalogClock({ className = "" }: LiveAnalogClockProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const second = now.getSeconds();
  const minute = now.getMinutes();
  const hour = now.getHours();
  const hourAngle = (hour % 12) * 30 + minute * 0.5;
  const minuteAngle = minute * 6 + second * 0.1;
  const secondAngle = second * 6;

  const digitalTime = `${padTime(hour)}:${padTime(minute)}:${padTime(second)}`;
  const politeTime = useMemo(() => `${padTime(hour)}:${padTime(minute)}`, [hour, minute]);

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="relative h-22 w-22 rounded-full border border-border bg-card shadow-sm">
        <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label="Live analog clock">
          <circle cx="50" cy="50" r="46" className="fill-background stroke-border" strokeWidth="2" />
          {[0, 30, 60, 90, 120, 150].map((deg) => (
            <g key={deg} transform={`rotate(${deg} 50 50)`}>
              <line x1="50" y1="10" x2="50" y2="16" className="stroke-muted-foreground" strokeWidth="2" />
              <line x1="50" y1="84" x2="50" y2="90" className="stroke-muted-foreground" strokeWidth="2" />
            </g>
          ))}

          <line
            x1="50"
            y1="50"
            x2="50"
            y2="28"
            className="stroke-foreground"
            strokeWidth="3.5"
            strokeLinecap="round"
            transform={`rotate(${hourAngle} 50 50)`}
          />
          <line
            x1="50"
            y1="50"
            x2="50"
            y2="18"
            className="stroke-primary"
            strokeWidth="2.6"
            strokeLinecap="round"
            transform={`rotate(${minuteAngle} 50 50)`}
          />
          <line
            x1="50"
            y1="54"
            x2="50"
            y2="15"
            className="stroke-accent"
            strokeWidth="1.5"
            strokeLinecap="round"
            transform={`rotate(${secondAngle} 50 50)`}
          />
          <circle cx="50" cy="50" r="3.2" className="fill-primary" />
        </svg>
      </div>

      <div className="leading-tight">
        <p className="text-xs text-muted-foreground">Local time</p>
        <p className="text-sm font-semibold tabular-nums">{digitalTime}</p>
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {politeTime}
        </span>
      </div>
    </div>
  );
}
