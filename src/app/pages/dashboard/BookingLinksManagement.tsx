// Manage and copy public booking URLs.

import React, { useMemo, useState } from "react";
import { Copy, Download, ExternalLink, Link as LinkIcon, QrCode } from "lucide-react";
import { useEffect } from "react";
import { api } from "../../../lib/api/client";
import { Button } from "../../components/ui/button";
import { ImageUpload } from "../../components/forms/ImageUpload";

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
  const [links, setLinks] = useState<BookingLink[]>([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [busyQr, setBusyQr] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    public_tagline: "",
    public_description: "",
    public_logo_url: "",
  });

  useEffect(() => {
    api
      .getBookingLinks()
      .then((data) => {
        const items: BookingLink[] = [
          { label: "Main booking link (all services)", url: normalizeToCurrentOrigin(data.business_url) },
          ...data.service_urls.map((item) => ({
            label: `Service: ${item.service_name}`,
            url: normalizeToCurrentOrigin(item.url),
          })),
        ];
        setLinks(items);
        setError("");
      })
      .catch(() => setError("Unable to load booking links."));
    api
      .myTenant()
      .then((tenant) =>
        setProfileForm({
          public_tagline: tenant.public_tagline ?? "",
          public_description: tenant.public_description ?? "",
          public_logo_url: tenant.public_logo_url ?? "",
        })
      )
      .catch(() => null);
  }, []);

  const totalLinks = useMemo(() => links.length, [links]);

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
      setError("");
    } catch {
      setError("Unable to save public booking profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Booking Links</h1>
        <p className="text-muted-foreground mt-1">
          Share a single public booking page or direct service-specific links.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="bg-card border border-border rounded-xl p-5">
        <p className="text-sm text-muted-foreground">
          Total links available: <span className="font-semibold text-foreground">{totalLinks}</span>
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Public Booking Branding</h2>
        <p className="text-sm text-muted-foreground">
          Customize what clients see on your public booking page.
        </p>
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Tagline / info</label>
            <input
              className="w-full px-3 py-2 rounded-lg border border-border bg-background"
              value={profileForm.public_tagline}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, public_tagline: e.target.value }))}
              placeholder="Book your appointment online"
              disabled={savingProfile}
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Description</label>
            <textarea
              className="w-full px-3 py-2 rounded-lg border border-border bg-background min-h-[88px]"
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
            Save Public Profile
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {links.map((item) => (
          <div key={item.url} className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground flex items-center gap-2">
                  <LinkIcon className="w-4 h-4" />
                  {item.label}
                </p>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary break-all mt-2 inline-flex items-center gap-1"
                >
                  {item.url}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <button
                  onClick={() => void handleCopy(item.url)}
                  className="px-3 py-2 rounded-lg text-sm border border-border hover:bg-muted inline-flex items-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  {copied === item.url ? "Copied" : "Copy"}
                </button>
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
                <a
                  href={qrImageUrl(item.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-2 rounded-lg text-sm border border-border hover:bg-muted inline-flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Open QR
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
