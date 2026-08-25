import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Send, User } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card, CardContent } from "../ui/card";
import { OrionAvatar } from "./OrionAvatar";
import { api } from "../../../lib/api/client";
import {
  applyOrionStreamEvent,
  ORION_BUSINESS_INTRO,
  type OrionActivityStep,
  type OrionMessage,
} from "./orion-chat-shared";

function ActivityFeed({ steps }: { steps: OrionActivityStep[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3 mr-8 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Working…</p>
      {steps.map((step) => (
        <div key={step.id} className="flex items-center gap-2 text-sm text-muted-foreground">
          {step.status === "running" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          ) : (
            <Check className="w-3.5 h-3.5 text-primary shrink-0" />
          )}
          <span>{step.label}</span>
        </div>
      ))}
    </div>
  );
}

type OrionChatPaneProps = {
  agent?: "business" | "onboarding";
  intro?: OrionMessage[];
  placeholder?: string;
  hint?: string;
  variant?: "page" | "floating";
  resetOnUnmount?: boolean;
};

export function OrionChatPane({
  agent = "business",
  intro = ORION_BUSINESS_INTRO,
  placeholder = "Ask Orion about bookings, availability, or ops…",
  hint = "Booking changes require your approval.",
  variant = "page",
  resetOnUnmount = true,
}: OrionChatPaneProps) {
  const [messages, setMessages] = useState<OrionMessage[]>(intro);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activitySteps, setActivitySteps] = useState<OrionActivityStep[]>([]);
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!resetOnUnmount) return;
    return () => {
      setMessages(intro);
      setThreadId(undefined);
      setInputValue("");
    };
  }, [intro, resetOnUnmount]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, activitySteps, isLoading]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMessage: OrionMessage = {
      id: Date.now().toString(),
      type: "user",
      content: text.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);
    setActivitySteps([{ id: "status", label: "Starting…", status: "running" }]);
    const aiMessageId = `${Date.now()}-ai`;
    setMessages((prev) => [
      ...prev,
      { id: aiMessageId, type: "ai", content: "", timestamp: new Date() },
    ]);
    try {
      await api.aiChatStream({ message: text.trim(), agent, thread_id: threadId }, (event) => {
        applyOrionStreamEvent(
          event,
          setActivitySteps,
          aiMessageId,
          setMessages,
          setThreadId,
          agent,
        );
      });
    } catch {
      setActivitySteps([]);
      setMessages((prev) =>
        prev
          .filter((msg) => msg.id !== aiMessageId)
          .concat({
            id: `${Date.now()}-err`,
            type: "ai",
            content: "I couldn't reach Orion right now. Please try again in a moment.",
            timestamp: new Date(),
          }),
      );
    } finally {
      setIsLoading(false);
      setActivitySteps([]);
    }
  };

  const resolvePending = async (
    messageId: string,
    actions: Array<{ id: string; type: string; args: Record<string, unknown> }>,
    decision: "approve" | "reject",
  ) => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const response = await api.aiChatResume({ decision, actions, thread_id: threadId });
      setMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? { ...msg, pendingActions: undefined } : msg)),
      );
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-resume`,
          type: "ai",
          content: response.reply,
          timestamp: new Date(),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-resume-err`,
          type: "ai",
          content: "Could not apply that action. Please try again.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const chatHeight = variant === "floating" ? "h-[340px]" : "h-[min(560px,70vh)]";

  const body = (
    <>
      <div ref={scrollRef} className={`${chatHeight} overflow-y-auto p-4 space-y-3`}>
        {messages.map((message) => (
          <div key={message.id} className="space-y-2">
            <div className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl p-3 ${
                  message.type === "user"
                    ? "bg-primary text-white ml-6"
                    : "bg-muted text-foreground mr-6"
                }`}
              >
                {message.type === "ai" && (
                  <div className="flex items-center gap-2 mb-1.5">
                    <OrionAvatar size="xs" />
                    <span className="text-xs font-semibold">Orion</span>
                  </div>
                )}
                <p className="whitespace-pre-line text-sm">{message.content}</p>
                {message.pendingActions && message.pendingActions.length > 0 && (
                  <div className="mt-2 space-y-2 rounded-lg border border-border bg-background/70 p-2">
                    <p className="text-xs font-medium">Needs your approval</p>
                    {message.pendingActions.map((action) => (
                      <p key={action.id} className="text-xs text-muted-foreground">
                        {action.type}: {JSON.stringify(action.args)}
                      </p>
                    ))}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={isLoading}
                        onClick={() =>
                          resolvePending(message.id, message.pendingActions || [], "approve")
                        }
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isLoading}
                        onClick={() =>
                          resolvePending(message.id, message.pendingActions || [], "reject")
                        }
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                )}
                {message.type === "user" && (
                  <div className="flex items-center justify-end gap-1 mt-1.5">
                    <User className="w-3 h-3" />
                    <span className="text-xs opacity-80">You</span>
                  </div>
                )}
              </div>
            </div>
            {message.suggestions && message.type === "ai" && (
              <div className="flex flex-wrap gap-1.5 mr-6">
                {message.suggestions.map((suggestion) => (
                  <Button
                    key={suggestion}
                    variant="outline"
                    size="sm"
                    disabled={isLoading}
                    onClick={() => sendMessage(suggestion)}
                    className="text-xs h-7"
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            )}
          </div>
        ))}
        {isLoading && <ActivityFeed steps={activitySteps} />}
      </div>
      <div className={`p-3 border-t border-border ${variant === "floating" ? "bg-card" : "bg-muted/30"}`}>
        <div className="flex gap-2">
          <Input
            placeholder={placeholder}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void sendMessage(inputValue);
            }}
            className="flex-1 h-9 text-sm"
            disabled={isLoading}
          />
          <Button
            size="icon"
            onClick={() => void sendMessage(inputValue)}
            className="bg-primary hover:bg-primary/90 shrink-0"
            disabled={isLoading}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        {hint && <p className="text-[11px] text-muted-foreground mt-1.5">{hint}</p>}
      </div>
    </>
  );

  if (variant === "floating") {
    return <div className="flex flex-col min-h-0">{body}</div>;
  }

  return (
    <Card className="border border-border">
      <CardContent className="p-0">{body}</CardContent>
    </Card>
  );
}
