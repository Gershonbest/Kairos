// Dashboard Orion hub: Chat | Knowledge | Onboarding.

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Upload, Trash2, RefreshCw, FileText } from "lucide-react";
import { api } from "../../../lib/api/client";
import { queryKeys } from "../../../lib/queryClient";
import { OrionChatPane } from "../../components/orion/OrionChatPane";
import { OrionAvatar } from "../../components/orion/OrionAvatar";
import { ORION_ONBOARDING_INTRO } from "../../components/orion/orion-chat-shared";
import {
  EmptyState,
  ErrorNote,
  ListSkeleton,
  PageHeader,
  PageShell,
} from "../../components/dashboard-ui";

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function KnowledgePane() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqAnswer, setFaqAnswer] = useState("");
  const [cancellationPolicy, setCancellationPolicy] = useState("");
  const [bookingPolicies, setBookingPolicies] = useState("");
  const [policiesHydrated, setPoliciesHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");

  const docsQuery = useQuery({
    queryKey: queryKeys.knowledgeDocuments,
    queryFn: () => api.listKnowledgeDocuments(),
  });
  const faqsQuery = useQuery({
    queryKey: queryKeys.knowledgeFaqs,
    queryFn: () => api.listKnowledgeFaqs(),
  });
  const tenantQuery = useQuery({
    queryKey: queryKeys.tenant,
    queryFn: () => api.myTenant(),
  });

  useEffect(() => {
    if (!tenantQuery.data || policiesHydrated) return;
    setCancellationPolicy(tenantQuery.data.cancellation_policy || "");
    setBookingPolicies(tenantQuery.data.booking_policies || "");
    setPoliciesHydrated(true);
  }, [tenantQuery.data, policiesHydrated]);

  const docs = docsQuery.data?.documents ?? [];
  const limit = docsQuery.data?.limit ?? 20;
  const faqs = faqsQuery.data ?? [];
  const loadError =
    docsQuery.isError || faqsQuery.isError
      ? docsQuery.error instanceof Error
        ? docsQuery.error.message
        : faqsQuery.error instanceof Error
          ? faqsQuery.error.message
          : "Unable to load knowledge library."
      : "";

  async function invalidateKnowledge() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeDocuments }),
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeFaqs }),
    ]);
  }

  const onUpload = async (file: File | null) => {
    if (!file || busy) return;
    setBusy(true);
    setActionError("");
    setMessage("");
    try {
      const doc = await api.uploadKnowledgeDocument(file);
      if (doc.status === "failed") {
        setActionError(doc.error_message || "Upload failed to extract text.");
      } else {
        setMessage(`Indexed “${doc.title}”.`);
      }
      await invalidateKnowledge();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onDeleteDoc = async (id: string) => {
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      await api.deleteKnowledgeDocument(id);
      setMessage("Document removed and knowledge reindexed.");
      await invalidateKnowledge();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  const onReindex = async () => {
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      const result = await api.reindexKnowledge();
      setMessage(`Reindexed ${result.chunks} knowledge chunks.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Reindex failed.");
    } finally {
      setBusy(false);
    }
  };

  const onSavePolicies = async () => {
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      await api.updateKnowledgePolicies({
        cancellation_policy: cancellationPolicy,
        booking_policies: bookingPolicies,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.tenant });
      setMessage("Policies saved and reindexed.");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not save policies.");
    } finally {
      setBusy(false);
    }
  };

  const onAddFaq = async () => {
    if (!faqQuestion.trim() || !faqAnswer.trim() || busy) return;
    setBusy(true);
    setActionError("");
    try {
      await api.upsertKnowledgeFaq({
        question: faqQuestion.trim(),
        answer: faqAnswer.trim(),
      });
      setFaqQuestion("");
      setFaqAnswer("");
      setMessage("FAQ saved.");
      await queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeFaqs });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not save FAQ.");
    } finally {
      setBusy(false);
    }
  };

  const onDeleteFaq = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.deleteKnowledgeFaq(id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeFaqs });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not delete FAQ.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {loadError && <ErrorNote>{loadError}</ErrorNote>}
      {actionError && <ErrorNote>{actionError}</ErrorNote>}
      {message && !actionError && <ErrorNote tone="success">{message}</ErrorNote>}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-lg">Business documents</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload PDF, TXT, or Markdown. These train Orion on your dashboard and the public
              booking chat. {docs.length}/{limit} used · max 10MB each.
            </p>
          </div>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void onReindex()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Reindex
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="cursor-pointer rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center transition-colors hover:bg-muted/40"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0] || null;
              void onUpload(file);
            }}
          >
            <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Drop a file or click to upload</p>
            <p className="mt-1 text-xs text-muted-foreground">PDF · TXT · MD</p>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
              className="hidden"
              disabled={busy}
              onChange={(e) => void onUpload(e.target.files?.[0] || null)}
            />
          </div>

          {docsQuery.isPending ? (
            <ListSkeleton rows={3} />
          ) : docs.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No documents yet"
              description="Add service menus, house rules, or FAQs so Orion answers accurately."
            />
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {docs.map((doc) => (
                <li key={doc.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 gap-3">
                    <FileText className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{doc.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.filename} · {formatBytes(doc.byte_size)} ·{" "}
                        <span
                          className={
                            doc.status === "ready"
                              ? "text-primary"
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
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
              <Textarea
                id="cancelPolicy"
                value={cancellationPolicy}
                onChange={(e) => setCancellationPolicy(e.target.value)}
                className="mt-1 min-h-[90px]"
                disabled={busy}
              />
            </div>
            <div>
              <Label htmlFor="bookingPolicies">Booking policies</Label>
              <Textarea
                id="bookingPolicies"
                value={bookingPolicies}
                onChange={(e) => setBookingPolicies(e.target.value)}
                className="mt-1 min-h-[90px]"
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
              <Textarea
                id="faqA"
                value={faqAnswer}
                onChange={(e) => setFaqAnswer(e.target.value)}
                className="mt-1 min-h-[70px]"
                disabled={busy}
              />
            </div>
            <Button disabled={busy} onClick={() => void onAddFaq()}>
              Add FAQ
            </Button>
            {faqsQuery.isPending ? (
              <ListSkeleton rows={2} />
            ) : faqs.length > 0 ? (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {faqs.map((faq) => (
                  <li key={faq.id} className="flex justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{faq.question}</p>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{faq.answer}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => void onDeleteFaq(faq.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No FAQs yet"
                description="Add short questions clients often ask so Orion can answer them."
              />
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
    <PageShell>
      <PageHeader
        eyebrow="Assistant"
        title={
          <span className="inline-flex items-center gap-3">
            <OrionAvatar size="md" />
            Orion
          </span>
        }
        description="Chat with Orion, upload knowledge documents, or onboard your business. Use the floating bot on any dashboard page for quick questions — this workspace adds knowledge and onboarding tools."
      />

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
    </PageShell>
  );
}
