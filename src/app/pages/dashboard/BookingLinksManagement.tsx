// Manage and copy public booking URLs.

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, ExternalLink, Link as LinkIcon, QrCode } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api/client";
import { queryKeys } from "../../../lib/queryClient";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { ImageUpload } from "../../components/forms/ImageUpload";
import { EmptyState, ErrorNote, PageHeader, PageShell, SectionCard } from "../../components/dashboard-ui";

type BookingLink = {
  label: string;
  url: string;
};

const PUBLIC_UI_BASE_URL =
  ((import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_PUBLIC_UI_BASE_URL ?? "").trim();

function normalizeToCurrentOrigin(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (PUBLIC_UI_BASE_URL) {
      const base = PUBLIC_UI_BASE_URL.replace(/\/$/, "");
      return `${base}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    if (typeof window !== "undefined" && window.location.hostname === "localhost") {
      return `${window.location.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

function qrImageUrl(value: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=1024x1024&data=${encodeURIComponent(value)}`;
}

export function BookingLinksManagement() {
  const queryClient = useQueryClient();
  const hydratedRef = useRef(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [busyQr, setBusyQr] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    public_tagline: "",
    public_description: "",
    public_logo_url: "",
  });

  const { data: bookingLinks, isError: linksFailed } = useQuery({
    queryKey: queryKeys.bookingLinks,
    queryFn: () => api.getBookingLinks(),
  });

  const { data: tenant } = useQuery({
    queryKey: queryKeys.tenant,
    queryFn: () => api.myTenant(),
  });

  const links = useMemo<BookingLink[]>(() => {
    if (!bookingLinks) return [];
    return [
      { label: "Main booking link (all services)", url: normalizeToCurrentOrigin(bookingLinks.business_url) },
      ...bookingLinks.service_urls.map((item) => ({
        label: `Service: ${item.service_name}`,
        url: normalizeToCurrentOrigin(item.url),
      })),
    ];
  }, [bookingLinks]);

  useLayoutEffect(() => {
    if (!tenant || hydratedRef.current) return;
    hydratedRef.current = true;
    setProfileForm({
      public_tagline: tenant.public_tagline ?? "",
      public_description: tenant.public_description ?? "",
      public_logo_url: tenant.public_logo_url ?? "",
    });
  }, [tenant]);

  const displayError = error || (linksFailed ? "Unable to load booking links." : "");
  const totalLinks = links.length;

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(""), 1400);
    } catch {
      setError("Copy failed. Please copy manually.");
    }
  };

  const handleExportQr = async (url: string, filenameHint: string) => {
    try {
      setBusyQr(url);
      const res = await fetch(qrImageUrl(url));
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${filenameHint.replace(/[^a-z0-9-_]/gi, "-").toLowerCase()}-qr.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch {
      setError("QR export failed.");
    } finally {
      setBusyQr("");
    }
  };

  const handleSaveProfile = async () => {
    try {
      setSavingProfile(true);
      await api.updatePublicProfile({
        public_tagline: profileForm.public_tagline || undefined,
        public_description: profileForm.public_description || undefined,
        public_logo_url: profileForm.public_logo_url || undefined,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.tenant }),
        queryClient.invalidateQueries({ queryKey: queryKeys.settingsBundle }),
        queryClient.invalidateQueries({ queryKey: queryKeys.bookingLinks }),
      ]);
      setError("");
    } catch {
      setError("Unable to save public booking profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <PageShell>
      <PageHeader
        eyebrow="Customers"
        title="Booking links"
        description="Share a single public booking page or direct service-specific links."
      />

      {displayError && <ErrorNote>{displayError}</ErrorNote>}

      <SectionCard>
        <p className="text-sm text-muted-foreground">
          Total links available: <span className="font-semibold text-foreground">{totalLinks}</span>
        </p>
      </SectionCard>

      <SectionCard
        title="Public booking branding"
        description="Customize what clients see on your public booking page."
      >
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Tagline / info</label>
            <Input
              value={profileForm.public_tagline}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, public_tagline: e.target.value }))}
              placeholder="Book your appointment online"
              disabled={savingProfile}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Description</label>
            <Textarea
              className="min-h-[88px]"
              value={profileForm.public_description}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, public_description: e.target.value }))}
              placeholder="Tell clients about your business"
              disabled={savingProfile}
            />
          </div>
          <ImageUpload
            label="Company logo"
            value={profileForm.public_logo_url}
            onChange={(public_logo_url) => setProfileForm((prev) => ({ ...prev, public_logo_url }))}
            uploadKind="logo"
            disabled={savingProfile}
            hint="Upload your logo for the public booking page."
          />
        </div>
        <div className="flex justify-end border-t border-border pt-4">
          <Button
            onClick={() => void handleSaveProfile()}
            className="w-full sm:w-auto bg-primary hover:bg-primary/90"
            loading={savingProfile}
            loadingLabel="Saving..."
          >
            Save public profile
          </Button>
        </div>
      </SectionCard>

      <div className="space-y-3">
        {links.length === 0 ? (
          <EmptyState
            icon={LinkIcon}
            title="No booking links yet"
            description="Add a service to generate shareable booking URLs."
          />
        ) : (
          links.map((item) => (
          <SectionCard key={item.url}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <LinkIcon className="h-4 w-4 text-muted-foreground" />
                  {item.label}
                </p>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  title="Open booking page"
                  className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 font-mono text-[12px] leading-relaxed text-foreground/80 transition-colors hover:border-foreground/20 hover:bg-muted hover:text-foreground"
                >
                  <span className="min-w-0 break-all">{item.url}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </a>
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <Button variant="outline" size="sm" onClick={() => void handleCopy(item.url)}>
                  <Copy className="mr-2 h-4 w-4" />
                  {copied === item.url ? "Copied" : "Copy"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleExportQr(item.url, item.label)}
                  loading={busyQr === item.url}
                  loadingLabel="Generating..."
                  disabled={busyQr !== ""}
                >
                  <QrCode className="w-4 h-4" />
                  Export QR
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={qrImageUrl(item.url)} target="_blank" rel="noreferrer">
                    <Download className="mr-2 h-4 w-4" />
                    Open QR
                  </a>
                </Button>
              </div>
            </div>
          </SectionCard>
          ))
        )}
      </div>
    </PageShell>
  );
}
