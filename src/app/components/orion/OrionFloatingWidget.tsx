import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router";
import { ExternalLink, Minus } from "lucide-react";
import { Button } from "../ui/button";
import { OrionAvatar, OrionAvatarButton } from "./OrionAvatar";
import { OrionChatPane } from "./OrionChatPane";
import {
  clampOrionWidgetPosition,
  defaultOrionWidgetPosition,
  ORION_WIDGET_POS_KEY,
} from "./orion-chat-shared";

const FAB_SIZE = 56;
const PANEL_WIDTH = 380;
const PANEL_HEIGHT = 480;
const DRAG_THRESHOLD = 6;

type WidgetMode = "minimized" | "open";

export function OrionFloatingWidget() {
  const location = useLocation();
  const hideOnFullPage =
    location.pathname.startsWith("/dashboard/orion") ||
    location.pathname.startsWith("/dashboard/ai-assistant");

  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<WidgetMode>("minimized");
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef({
    active: false,
    moved: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });

  const widgetWidth = mode === "open" ? PANEL_WIDTH : FAB_SIZE;
  const widgetHeight = mode === "open" ? PANEL_HEIGHT : FAB_SIZE;

  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(ORION_WIDGET_POS_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { x: number; y: number };
        setPos(clampOrionWidgetPosition(saved.x, saved.y, FAB_SIZE, FAB_SIZE));
      } else {
        setPos(defaultOrionWidgetPosition(FAB_SIZE, FAB_SIZE));
      }
    } catch {
      setPos(defaultOrionWidgetPosition(FAB_SIZE, FAB_SIZE));
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(ORION_WIDGET_POS_KEY, JSON.stringify(pos));
  }, [pos, mounted]);

  useEffect(() => {
    const onResize = () => {
      setPos((current) => clampOrionWidgetPosition(current.x, current.y, widgetWidth, widgetHeight));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [widgetWidth, widgetHeight]);

  const persistPosition = useCallback(
    (x: number, y: number) => {
      setPos(clampOrionWidgetPosition(x, y, widgetWidth, widgetHeight));
    },
    [widgetWidth, widgetHeight],
  );

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    dragRef.current = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pos.x,
      originY: pos.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.moved = true;
    persistPosition(drag.originX + dx, drag.originY + dy);
  };

  const onPointerUp = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    drag.active = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (mode === "minimized" && !drag.moved) {
      setMode("open");
      setPos((current) =>
        clampOrionWidgetPosition(current.x, current.y, PANEL_WIDTH, PANEL_HEIGHT),
      );
    }
  };

  if (!mounted || hideOnFullPage) return null;

  return createPortal(
    <div
      className="fixed z-[200] select-none touch-none"
      style={{ left: pos.x, top: pos.y, width: widgetWidth }}
    >
      {mode === "minimized" ? (
        <OrionAvatarButton
          aria-label="Open Orion assistant"
          pulse
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      ) : (
        <div
          className="rounded-2xl border border-border/80 bg-card/95 backdrop-blur-md shadow-2xl overflow-hidden flex flex-col"
          style={{ width: PANEL_WIDTH, height: PANEL_HEIGHT }}
        >
          <div
            className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border/80 bg-muted/30 cursor-grab active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <OrionAvatar size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-none tracking-tight">Orion</p>
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">Orheo business assistant</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              asChild
              title="Open full workspace"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Link to="/dashboard/orion">
                <ExternalLink className="w-4 h-4" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              title="Minimize"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                setMode("minimized");
                setPos((current) =>
                  clampOrionWidgetPosition(current.x, current.y, FAB_SIZE, FAB_SIZE),
                );
              }}
            >
              <Minus className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 min-h-0 flex flex-col">
            <OrionChatPane
              variant="floating"
              resetOnUnmount={false}
              hint="Drag the header to move. Minimize anytime."
            />
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
