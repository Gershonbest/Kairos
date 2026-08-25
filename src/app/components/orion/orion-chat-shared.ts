// Shared Orion chat types, stream handling, and intro messages.

import type { Dispatch, SetStateAction } from "react";
import type { AiStreamEvent } from "../../../lib/api/client";

export type OrionMessage = {
  id: string;
  type: "user" | "ai";
  content: string;
  timestamp: Date;
  suggestions?: string[];
  pendingActions?: Array<{ id: string; type: string; args: Record<string, unknown> }>;
};

export type OrionActivityStep = {
  id: string;
  label: string;
  status: "running" | "done";
};

export const ORION_BUSINESS_INTRO: OrionMessage[] = [
  {
    id: "biz-1",
    type: "ai",
    content:
      "Hi! I'm Orion, your Orheo business assistant. Ask about availability, upcoming bookings, or day-to-day ops. Booking changes need your approval.",
    timestamp: new Date(),
    suggestions: [
      "Find available slots this week",
      "Show upcoming appointments",
      "Suggest optimal booking times",
    ],
  },
];

export const ORION_ONBOARDING_INTRO: OrionMessage[] = [
  {
    id: "onboard-1",
    type: "ai",
    content:
      "I'm Orion. Describe your business in plain language — services, pricing, hours, and policies — and I'll help set them up.",
    timestamp: new Date(),
    suggestions: [
      "We're a spa open Mon–Sat 9–6",
      "Add a 60-min facial for ₦25000",
      "Cancellation needs 24 hours notice",
    ],
  },
];

export function applyOrionStreamEvent(
  event: AiStreamEvent,
  setActivitySteps: Dispatch<SetStateAction<OrionActivityStep[]>>,
  aiMessageId: string,
  setMessages: Dispatch<SetStateAction<OrionMessage[]>>,
  setThreadId: Dispatch<SetStateAction<string | undefined>>,
  agent: "business" | "onboarding",
): boolean {
  if (event.type === "status") {
    setActivitySteps([{ id: "status", label: event.text, status: "running" }]);
    return false;
  }
  if (event.type === "tool_start") {
    setActivitySteps((prev) => {
      const done = prev.map((step) => ({ ...step, status: "done" as const }));
      return [...done, { id: `tool-${event.name}`, label: event.label || event.name, status: "running" }];
    });
    return false;
  }
  if (event.type === "tool_end") {
    setActivitySteps((prev) =>
      prev.map((step) =>
        step.id === `tool-${event.name}` ? { ...step, status: "done" } : step,
      ),
    );
    return false;
  }
  if (event.type === "token") {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === aiMessageId ? { ...msg, content: msg.content + event.text } : msg,
      ),
    );
    return false;
  }
  if (event.type === "final") {
    setThreadId(event.thread_id);
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === aiMessageId
          ? {
              ...msg,
              content: event.reply,
              pendingActions: event.pending_actions,
              suggestions:
                agent === "onboarding"
                  ? [
                      "Set up a 60-minute consultation for ₦15000",
                      "We're open Mon–Fri 9am–5pm",
                      "Add a cancellation policy: 24 hours notice",
                    ]
                  : event.suggestions,
            }
          : msg,
      ),
    );
    setActivitySteps([]);
    return true;
  }
  return false;
}

export function clampOrionWidgetPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number } {
  if (typeof window === "undefined") return { x, y };
  const pad = 12;
  return {
    x: Math.max(pad, Math.min(x, window.innerWidth - width - pad)),
    y: Math.max(pad, Math.min(y, window.innerHeight - height - pad)),
  };
}

export const ORION_WIDGET_POS_KEY = "orion-widget-position";

export function defaultOrionWidgetPosition(width: number, height: number): { x: number; y: number } {
  if (typeof window === "undefined") return { x: 24, y: 24 };
  return clampOrionWidgetPosition(
    window.innerWidth - width - 24,
    window.innerHeight - height - 24,
    width,
    height,
  );
}
