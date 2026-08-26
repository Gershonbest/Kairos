import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { api } from "../../../lib/api/client";
import { queryKeys } from "../../../lib/queryClient";

const NEW_TEMPLATE_VALUE = "__new_template__";
const PLACEHOLDER_HINT = "{client_name}, {business_name}, {help_email}, {booking_link}";

type SendClientEmailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  clientEmail: string;
  onSent?: () => void;
};

export function SendClientEmailDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  clientEmail,
  onSent,
}: SendClientEmailDialogProps) {
  const queryClient = useQueryClient();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const { data: templates = [], isPending: loadingTemplates } = useQuery({
    queryKey: queryKeys.clientEmailTemplates,
    queryFn: () => api.listClientEmailTemplates(),
    enabled: open,
  });

  const systemTemplates = useMemo(() => templates.filter((item) => item.is_system), [templates]);
  const customTemplates = useMemo(() => templates.filter((item) => !item.is_system), [templates]);

  const isCreatingTemplate = selectedTemplateId === NEW_TEMPLATE_VALUE;

  const reset = () => {
    setSelectedTemplateId("");
    setSubject("");
    setBody("");
    setTemplateName("");
    setBusy(false);
    setPreviewBusy(false);
    setError("");
    setSuccess("");
  };

  useEffect(() => {
    if (!open || loadingTemplates || templates.length === 0 || selectedTemplateId) return;
    setSelectedTemplateId(systemTemplates[0]?.id ?? templates[0]?.id ?? "");
  }, [open, loadingTemplates, templates, systemTemplates, selectedTemplateId]);

  useEffect(() => {
    if (!open || !selectedTemplateId || selectedTemplateId === NEW_TEMPLATE_VALUE) return;
    let cancelled = false;
    setPreviewBusy(true);
    setError("");
    api
      .previewClientEmail(clientId, { template_id: selectedTemplateId })
      .then((preview) => {
        if (cancelled) return;
        setSubject(preview.subject);
        setBody(preview.body);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unable to load template preview.");
      })
      .finally(() => {
        if (!cancelled) setPreviewBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, clientId, selectedTemplateId]);

  async function handleSaveTemplate() {
    if (!templateName.trim() || !subject.trim() || !body.trim()) {
      setError("Template name, subject, and message are required.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const created = await api.createClientEmailTemplate({
        name: templateName.trim(),
        subject: subject.trim(),
        body: body.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.clientEmailTemplates });
      setSelectedTemplateId(created.id);
      setTemplateName("");
      setSuccess("Template saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save template.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSend() {
    if (!subject.trim() || !body.trim()) {
      setError("Subject and message are required.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await api.sendClientEmail(clientId, {
        subject: subject.trim(),
        body: body.trim(),
        template_id:
          selectedTemplateId && selectedTemplateId !== NEW_TEMPLATE_VALUE
            ? selectedTemplateId
            : undefined,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.clientCommunications(clientId) });
      onSent?.();
      setSuccess(result.message);
      setTimeout(() => {
        reset();
        onOpenChange(false);
      }, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send email</DialogTitle>
          <DialogDescription>
            {clientName} · {clientEmail}. Choose a template, customize the message, and send from your business
            account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="email-template">Template</Label>
            <Select
              value={selectedTemplateId}
              onValueChange={(value) => {
                setSuccess("");
                setError("");
                if (value === NEW_TEMPLATE_VALUE) {
                  setSelectedTemplateId(value);
                  setSubject("");
                  setBody("");
                  return;
                }
                setSelectedTemplateId(value);
              }}
              disabled={busy || previewBusy || loadingTemplates}
            >
              <SelectTrigger id="email-template" className="mt-1">
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent>
                {systemTemplates.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Built-in templates</SelectLabel>
                    {systemTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {customTemplates.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Your templates</SelectLabel>
                    {customTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                <SelectGroup>
                  <SelectLabel>Create</SelectLabel>
                  <SelectItem value={NEW_TEMPLATE_VALUE}>New custom template</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {isCreatingTemplate && (
            <div>
              <Label htmlFor="template-name">Template name</Label>
              <Input
                id="template-name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g. Birthday offer"
                className="mt-1"
                disabled={busy}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use placeholders: {PLACEHOLDER_HINT}
              </p>
            </div>
          )}

          <div>
            <Label htmlFor="email-subject">Subject</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1"
              disabled={busy || previewBusy}
            />
          </div>

          <div>
            <Label htmlFor="email-body">Message</Label>
            <Textarea
              id="email-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="mt-1"
              disabled={busy || previewBusy}
            />
            {!isCreatingTemplate && (
              <p className="text-xs text-muted-foreground mt-1">
                Preview uses this client&apos;s details. You can edit before sending.
              </p>
            )}
          </div>

          {previewBusy && <p className="text-sm text-muted-foreground">Loading template preview…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-emerald-600">{success}</p>}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {isCreatingTemplate ? (
            <Button type="button" variant="outline" onClick={handleSaveTemplate} loading={busy} loadingLabel="Saving...">
              Save template
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedTemplateId(NEW_TEMPLATE_VALUE)}
              disabled={busy || !subject.trim() || !body.trim()}
            >
              Save as new template
            </Button>
          )}
          <Button type="button" onClick={handleSend} loading={busy} loadingLabel="Sending...">
            Send email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
