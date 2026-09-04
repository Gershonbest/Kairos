// Modal component to preview, customize theme, download as PNG, and share service booking card.

import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { BookingCardTheme, ServiceBookingCard, ServiceBookingCardProps } from "./ServiceBookingCard";
import { toPng } from "html-to-image";
import { Check, Copy, Download, QrCode, Share2, Sparkles } from "lucide-react";

interface ServiceBookingCardModalProps extends Omit<ServiceBookingCardProps, "theme"> {
  isOpen: boolean;
  onClose: () => void;
}

const THEME_OPTIONS: { id: BookingCardTheme; label: string; bgClass: string }[] = [
  { id: "light", label: "Executive Light", bgClass: "bg-slate-100 text-slate-900 border-slate-300" },
  { id: "onyx", label: "Midnight Onyx", bgClass: "bg-slate-950 text-white border-slate-700" },
  { id: "sapphire", label: "Royal Sapphire", bgClass: "bg-indigo-950 text-amber-300 border-indigo-700" },
  { id: "emerald", label: "Emerald Luxury", bgClass: "bg-emerald-950 text-emerald-300 border-emerald-700" },
];

export function ServiceBookingCardModal({
  isOpen,
  onClose,
  businessName,
  businessLogoUrl,
  businessCategory,
  businessLocation,
  serviceName,
  serviceDescription,
  servicePrice,
  serviceDeposit,
  serviceDuration,
  serviceAppointmentType,
  bookingUrl,
  serviceImageUrl,
}: ServiceBookingCardModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [selectedTheme, setSelectedTheme] = useState<BookingCardTheme>("light");
  const [isDownloading, setIsDownloading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setIsDownloading(true);

    try {
      // Small delay to ensure all images/fonts are loaded
      await new Promise((resolve) => setTimeout(resolve, 500));
      const dataUrl = await toPng(cardRef.current, {
        quality: 0.98,
        pixelRatio: 2,
        cacheBust: true,
      });

      const fileName = `${(serviceName || "service").replace(/[^a-z0-9]/gi, "-").toLowerCase()}-booking-card.png`;
      const link = document.createElement("a");
      link.download = fileName;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error("Failed to export card image:", err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleShare = async () => {
    if (!cardRef.current) return;
    try {
      const dataUrl = await toPng(cardRef.current, { quality: 0.95, pixelRatio: 2, cacheBust: true });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const fileName = `${(serviceName || "service").replace(/[^a-z0-9]/gi, "-").toLowerCase()}-booking-card.png`;
      const file = new File([blob], fileName, { type: "image/png" });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `${serviceName} - ${businessName}`,
          text: `Book ${serviceName} online at ${businessName}. Scan the QR code or click the link to schedule!`,
          files: [file],
        });
        setShareSuccess(true);
        setTimeout(() => setShareSuccess(false), 2000);
      } else {
        // Fallback: Copy link and trigger download
        await navigator.clipboard.writeText(bookingUrl);
        await handleDownload();
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      }
    } catch (err) {
      console.error("Share failed:", err);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Ignore copy error
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden sm:max-w-2xl rounded-3xl bg-slate-900 border-slate-800 text-white">
        <DialogHeader className="p-6 pb-3 border-b border-slate-800">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-white">
            <QrCode className="h-5 w-5 text-emerald-400" />
            Professional Booking Card
          </DialogTitle>
          <p className="text-xs text-slate-400 mt-1">
            Download or share high-resolution visual cards with your clients on WhatsApp, Instagram, or social media.
          </p>
        </DialogHeader>

        <div className="p-6 space-y-6 flex flex-col items-center justify-center bg-slate-950/60 max-h-[75vh] overflow-y-auto">
          {/* Theme Selector Toolbar */}
          <div className="w-full flex items-center justify-center gap-2 flex-wrap bg-slate-900 p-2 rounded-2xl border border-slate-800">
            <span className="text-xs font-semibold text-slate-400 mr-2 flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" /> Theme:
            </span>
            {THEME_OPTIONS.map((theme) => (
              <button
                key={theme.id}
                type="button"
                onClick={() => setSelectedTheme(theme.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  theme.bgClass
                } ${
                  selectedTheme === theme.id
                    ? "ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-900 scale-105"
                    : "opacity-75 hover:opacity-100"
                }`}
              >
                {theme.label}
              </button>
            ))}
          </div>

          {/* Live Card Preview */}
          <div className="p-2 sm:p-4 rounded-3xl bg-slate-900/40 border border-slate-800/80 shadow-2xl flex justify-center">
            <div ref={cardRef}>
              <ServiceBookingCard
                businessName={businessName}
                businessLogoUrl={businessLogoUrl}
                businessCategory={businessCategory}
                businessLocation={businessLocation}
                serviceName={serviceName}
                serviceDescription={serviceDescription}
                servicePrice={servicePrice}
                serviceDeposit={serviceDeposit}
                serviceDuration={serviceDuration}
                serviceAppointmentType={serviceAppointmentType}
                bookingUrl={bookingUrl}
                serviceImageUrl={serviceImageUrl}
                theme={selectedTheme}
              />
            </div>
          </div>
        </div>

        {/* Action Buttons Footer */}
        <div className="p-6 pt-4 bg-slate-900 border-t border-slate-800 flex flex-col sm:flex-row gap-3">
          <Button
            type="button"
            onClick={handleDownload}
            loading={isDownloading}
            loadingLabel="Exporting Card..."
            className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 shadow-lg shadow-emerald-600/20"
          >
            <Download className="mr-2 h-4 w-4" />
            Download Card Image (PNG)
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={handleShare}
            className="rounded-xl border-slate-700 bg-slate-800 text-white hover:bg-slate-700 font-semibold py-3"
          >
            {shareSuccess ? (
              <>
                <Check className="mr-2 h-4 w-4 text-emerald-400" />
                Shared!
              </>
            ) : (
              <>
                <Share2 className="mr-2 h-4 w-4 text-indigo-400" />
                Share Image
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={handleCopyLink}
            className="rounded-xl border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium py-3"
          >
            {copiedLink ? (
              <>
                <Check className="mr-2 h-4 w-4 text-emerald-400" />
                Copied Link!
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                Copy URL
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
