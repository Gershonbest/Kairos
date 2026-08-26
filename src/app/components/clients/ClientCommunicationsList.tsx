import { Mail, MessageCircle, Phone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { BrandLoader } from "../brand/BrandLoader";

export type ClientCommunicationItem = {
  id: string;
  channel: "email" | "phone_call" | "whatsapp";
  status: string;
  recipient: string;
  subject?: string | null;
  summary?: string | null;
  template_name?: string | null;
  actor_name?: string | null;
  created_at: string;
};

type ClientCommunicationsListProps = {
  items: ClientCommunicationItem[];
  loading?: boolean;
};

function channelIcon(channel: ClientCommunicationItem["channel"]) {
  if (channel === "email") return Mail;
  if (channel === "whatsapp") return MessageCircle;
  return Phone;
}

function channelLabel(channel: ClientCommunicationItem["channel"]) {
  if (channel === "email") return "Email";
  if (channel === "whatsapp") return "WhatsApp";
  return "Phone call";
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ClientCommunicationsList({ items, loading = false }: ClientCommunicationsListProps) {
  if (loading) {
    return <BrandLoader label="Loading activity" />;
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No outreach logged yet. Send an email or call this client to see activity here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const Icon = channelIcon(item.channel);
        return (
          <div key={item.id} className="flex gap-3 p-3 border border-border rounded-lg">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="font-medium">{channelLabel(item.channel)}</p>
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
                  {item.status}
                </span>
              </div>
              {item.subject && <p className="text-sm font-medium mt-1 truncate">{item.subject}</p>}
              {item.summary && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{item.summary}</p>
              )}
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                <span>To: {item.recipient}</span>
                {item.template_name && <span>Template: {item.template_name}</span>}
                {item.actor_name && <span>By: {item.actor_name}</span>}
                <span>{formatWhen(item.created_at)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ClientCommunicationsCard({
  items,
  loading,
}: ClientCommunicationsListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Outreach history</CardTitle>
      </CardHeader>
      <CardContent>
        <ClientCommunicationsList items={items} loading={loading} />
      </CardContent>
    </Card>
  );
}
