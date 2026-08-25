// Dashboard Orion hub: Chat | Knowledge | Onboarding.

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Upload, Trash2, RefreshCw, FileText } from "lucide-react";
import { api } from "../../../lib/api/client";
import { OrionChatPane } from "../../components/orion/OrionChatPane";
import { OrionAvatar } from "../../components/orion/OrionAvatar";
import { ORION_BUSINESS_INTRO, ORION_ONBOARDING_INTRO } from "../../components/orion/orion-chat-shared";

type KnowledgeDoc = {
  id: string;
  title: string;
  filename: string;
  content_type: string;
  status: string;
  error_message?: string | null;
  byte_size: number;
  created_at?: string | null;
};

type FaqItem = {
  id: string;
  question: string;
  answer: string;
};

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function KnowledgePane() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [limit, setLimit] = useState(20);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [cancellationPolicy, setCancellationPolicy] = useState("");
  const [bookingPolicies, setBookingPolicies] = useState("");
  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqAnswer, setFaqAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    try {
      const [docRes, faqRes, tenant] = await Promise.all([
        api.listKnowledgeDocuments(),
        api.listKnowledgeFaqs(),
        api.myTenant().catch(() => null),
      ]);
      setDocs(docRes.documents);
      setLimit(docRes.limit);
      setFaqs(faqRes);
      if (tenant) {
        setCancellationPolicy(tenant.cancellation_policy || "");
        setBookingPolicies(tenant.booking_policies || "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load knowledge library.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onUpload = async (file: File | null) => {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const doc = await api.uploadKnowledgeDocument(file);
      if (doc.status === "failed") {
        setError(doc.error_message || "Upload failed to extract text.");
      } else {
        setMessage(`Indexed “${doc.title}”.`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onDeleteDoc = async (id: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api.deleteKnowledgeDocument(id);
      setMessage("Document removed and knowledge reindexed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  const onReindex = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.reindexKnowledge();
      setMessage(`Reindexed ${result.chunks} knowledge chunks.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reindex failed.");
    } finally {
      setBusy(false);
    }
  };

  const onSavePolicies = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api.updateKnowledgePolicies({
        cancellation_policy: cancellationPolicy,
        booking_policies: bookingPolicies,
      });
      setMessage("Policies saved and reindexed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save policies.");
    } finally {
      setBusy(false);
    }
  };

  const onAddFaq = async () => {
    if (!faqQuestion.trim() || !faqAnswer.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.upsertKnowledgeFaq({
        question: faqQuestion.trim(),
        answer: faqAnswer.trim(),
      });
      setFaqQuestion("");
      setFaqAnswer("");
      setMessage("FAQ saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save FAQ.");
    } finally {
      setBusy(false);
    }
  };

  const onDeleteFaq = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.deleteKnowledgeFaq(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete FAQ.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {(message || error) && (
        <p className={`text-sm ${error ? "text-destructive" : "text-muted-foreground"}`}>
          {error || message}
        </p>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-lg">Business documents</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Upload PDF, TXT, or Markdown. These train Orion on your dashboard and the public
              booking chat. {docs.length}/{limit} used · max 10MB each.
            </p>
          </div>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void onReindex()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Reindex
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center cursor-pointer hover:bg-muted/40 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0] || null;
              void onUpload(file);
            }}
          >
            <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">Drop a file or click to upload</p>
            <p className="text-xs text-muted-foreground mt-1">PDF · TXT · MD</p>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
              className="hidden"
              disabled={busy}
              onChange={(e) => void onUpload(e.target.files?.[0] || null)}
            />
          </div>

          {docs.length === 0 ? (
            <div className="rounded-lg border border-border px-4 py-6 text-sm text-muted-foreground text-center">
              No documents yet. Add service menus, house rules, or FAQs so the AI answers accurately.
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {docs.map((doc) => (
                <li key={doc.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex gap-3">
                    <FileText className="w-4 h-4 mt-1 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{doc.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.filename} · {formatBytes(doc.byte_size)} ·{" "}
                        <span
                          className={
                            doc.status === "ready"
                              ? "text-emerald-700 dark:text-emerald-400"
                              : doc.status === "failed"
                                ? "text-destructive"
                                : ""
                          }
                        >
                          {doc.status}
                        </span>
                        {doc.error_message ? ` — ${doc.error_message}` : ""}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => void onDeleteDoc(doc.id)}
                    aria-label={`Delete ${doc.title}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Policies</CardTitle>
            <p className="text-sm text-muted-foreground">
              Shown to customers via Orion on your booking page when grounded in knowledge.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="cancelPolicy">Cancellation policy</Label>
              <textarea
                id="cancelPolicy"
                value={cancellationPolicy}
                onChange={(e) => setCancellationPolicy(e.target.value)}
                className="mt-1 w-full min-h-[90px] px-3 py-2 border border-input rounded-lg bg-background text-sm"
                disabled={busy}
              />
            </div>
            <div>
              <Label htmlFor="bookingPolicies">Booking policies</Label>
              <textarea
                id="bookingPolicies"
                value={bookingPolicies}
                onChange={(e) => setBookingPolicies(e.target.value)}
                className="mt-1 w-full min-h-[90px] px-3 py-2 border border-input rounded-lg bg-background text-sm"
                disabled={busy}
              />
            </div>
            <Button disabled={busy} onClick={() => void onSavePolicies()}>
              Save policies
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">FAQs</CardTitle>
            <p className="text-sm text-muted-foreground">
              Short Q&amp;A pairs indexed for Orion on public booking.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="faqQ">Question</Label>
              <Input
                id="faqQ"
                value={faqQuestion}
                onChange={(e) => setFaqQuestion(e.target.value)}
                className="mt-1"
                disabled={busy}
              />
            </div>
            <div>
              <Label htmlFor="faqA">Answer</Label>
              <textarea
                id="faqA"
                value={faqAnswer}
                onChange={(e) => setFaqAnswer(e.target.value)}
                className="mt-1 w-full min-h-[70px] px-3 py-2 border border-input rounded-lg bg-background text-sm"
                disabled={busy}
              />
            </div>
            <Button disabled={busy} onClick={() => void onAddFaq()}>
              Add FAQ
            </Button>
            {faqs.length > 0 && (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {faqs.map((faq) => (
                  <li key={faq.id} className="px-3 py-2 flex justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{faq.question}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{faq.answer}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => void onDeleteFaq(faq.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function AIAssistant() {
  const [tab, setTab] = useState("chat");

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold flex items-center gap-3">
          <OrionAvatar size="md" />
          Orion
        </h1>
        <p className="text-muted-foreground mt-1">
          Chat with Orion, upload knowledge documents, or onboard your business. Use the floating bot
          on any dashboard page for quick questions — this workspace adds knowledge and onboarding
          tools.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
          <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="mt-4">
          {tab === "chat" && (
            <OrionChatPane
              hint="Chats reset when you leave this page. Booking changes require approval."
            />
          )}
        </TabsContent>

        <TabsContent value="knowledge" className="mt-4">
          {tab === "knowledge" && <KnowledgePane />}
        </TabsContent>

        <TabsContent value="onboarding" className="mt-4">
          {tab === "onboarding" && (
            <OrionChatPane
              agent="onboarding"
              intro={ORION_ONBOARDING_INTRO}
              placeholder="Describe your business, services, and hours…"
              hint="Onboarding chat clears when you leave. Changes apply to your live tenant data."
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
