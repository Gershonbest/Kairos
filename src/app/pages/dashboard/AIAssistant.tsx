// AI scheduling assistant chat interface for tenants.

import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Sparkles, Send, Calendar, User, Clock, CheckCircle } from "lucide-react";
import { useState } from "react";
import { api } from "../../../lib/api/client";

interface Message {
  id: string;
  type: "user" | "ai";
  content: string;
  timestamp: Date;
  suggestions?: string[];
}

const initialMessages: Message[] = [
  {
    id: "1",
    type: "ai",
    content:
      "Hi! I'm your AI booking assistant. I analyze your real calendar data to find open slots, spot gaps, and suggest optimal booking times. How can I help?",
    timestamp: new Date(),
    suggestions: [
      "Find available slots this week",
      "Show upcoming appointments",
      "Suggest optimal booking times",
    ],
  },
];

export function AIAssistant() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: "user",
      content: text.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      const response = await api.askAssistant({ message: text.trim() });
      const aiMessage: Message = {
        id: `${Date.now()}-ai`,
        type: "ai",
        content: response.reply,
        timestamp: new Date(),
        suggestions: response.suggestions,
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-err`,
          type: "ai",
          content: "I couldn't reach the scheduling service. Please try again in a moment.",
          timestamp: new Date(),
          suggestions: ["Find available slots this week", "Show upcoming appointments"],
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = () => sendMessage(inputValue);

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(suggestion);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-2">
            <Sparkles className="w-8 h-8 text-[#3B3680]" />
            AI Assistant
          </h1>
          <p className="text-muted-foreground mt-1">Natural language booking and smart scheduling suggestions</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-[#3B3680]/20 bg-gradient-to-br from-[#3B3680]/5 to-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#3B3680]" />
              Smart Scheduling
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              AI analyzes your calendar and suggests optimal booking times based on availability, buffers, and booking patterns.
            </p>
          </CardContent>
        </Card>

        <Card className="border-[#2ECC71]/20 bg-gradient-to-br from-[#2ECC71]/5 to-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#2ECC71]" />
              Natural Language
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Ask in plain English — find slots, review upcoming appointments, or get optimization tips.
            </p>
          </CardContent>
        </Card>

        <Card className="border-[#3B3680]/20 bg-gradient-to-br from-purple-50/70 dark:from-purple-500/10 to-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-[#3B3680]" />
              Gap Detection
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Spots unfilled gaps in your week and recommends express slots to maximize utilization.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-2 border-[#3B3680]/20">
        <CardHeader className="bg-gradient-to-r from-[#3B3680]/5 to-[#2ECC71]/5">
          <CardTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3B3680] to-[#2ECC71] flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            AI Chat Assistant
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="h-[500px] overflow-y-auto p-6 space-y-4">
            {messages.map((message) => (
              <div key={message.id} className="space-y-2">
                <div className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl p-4 ${
                      message.type === "user"
                        ? "bg-[#3B3680] text-white ml-12"
                        : "bg-muted text-foreground mr-12"
                    }`}
                  >
                    {message.type === "ai" && (
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#3B3680] to-[#2ECC71] flex items-center justify-center">
                          <Sparkles className="w-3 h-3 text-white" />
                        </div>
                        <span className="text-sm font-medium">AI Assistant</span>
                      </div>
                    )}
                    <p className="whitespace-pre-line">{message.content}</p>
                    {message.type === "user" && (
                      <div className="flex items-center justify-end gap-2 mt-2">
                        <User className="w-3 h-3" />
                        <span className="text-xs opacity-80">You</span>
                      </div>
                    )}
                  </div>
                </div>

                {message.suggestions && message.type === "ai" && (
                  <div className="flex flex-wrap gap-2 ml-0 mr-12">
                    {message.suggestions.map((suggestion, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        size="sm"
                        disabled={isLoading}
                        onClick={() => handleSuggestionClick(suggestion)}
                        className="text-xs hover:bg-[#3B3680] hover:text-white hover:border-[#3B3680]"
                      >
                        {suggestion}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <p className="text-sm text-muted-foreground ml-2">Analyzing your schedule...</p>
            )}
          </div>

          <div className="p-4 border-t border-border bg-muted/30">
            <div className="flex gap-2">
              <Input
                placeholder="Ask me anything about your bookings..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSend();
                }}
                className="flex-1"
                disabled={isLoading}
              />
              <Button onClick={handleSend} className="bg-[#3B3680] hover:bg-[#2E2A5C]" disabled={isLoading}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Try: "Find available slots this week" or "Suggest optimal booking times"
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Button variant="outline" className="justify-start" disabled={isLoading} onClick={() => sendMessage("Find available slots this week")}>
              <Calendar className="w-4 h-4 mr-2" />
              Find Availability
            </Button>
            <Button variant="outline" className="justify-start" disabled={isLoading} onClick={() => sendMessage("Show upcoming appointments")}>
              <Clock className="w-4 h-4 mr-2" />
              Upcoming Bookings
            </Button>
            <Button variant="outline" className="justify-start" disabled={isLoading} onClick={() => sendMessage("What services should I promote?")}>
              <User className="w-4 h-4 mr-2" />
              Booking Insights
            </Button>
            <Button variant="outline" className="justify-start" disabled={isLoading} onClick={() => sendMessage("Suggest optimal booking times")}>
              <Sparkles className="w-4 h-4 mr-2" />
              AI Suggestions
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
