// High-class, printable and shareable service booking card component.

import { BadgeCheck, Calendar, Clock, MapPin, QrCode, ShieldCheck, Sparkles } from "lucide-react";
import { resolveMediaUrl } from "../../../lib/media";

export type BookingCardTheme = "light" | "onyx" | "sapphire" | "emerald";

export interface ServiceBookingCardProps {
  businessName: string;
  businessLogoUrl?: string;
  businessCategory?: string;
  businessLocation?: string;
  serviceName: string;
  serviceDescription?: string;
  servicePrice: number;
  serviceDeposit?: number;
  serviceDuration: number | string;
  serviceAppointmentType?: string;
  bookingUrl: string;
  serviceImageUrl?: string;
  theme?: BookingCardTheme;
  className?: string;
}

function generateQrUrl(dataUrl: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=10&data=${encodeURIComponent(dataUrl)}`;
}

export function ServiceBookingCard({
  businessName,
  businessLogoUrl,
  businessCategory,
  businessLocation,
  serviceName,
  serviceDescription,
  servicePrice,
  serviceDeposit = 0,
  serviceDuration,
  serviceAppointmentType = "onsite",
  bookingUrl,
  serviceImageUrl,
  theme = "light",
  className = "",
}: ServiceBookingCardProps) {
  const qrUrl = generateQrUrl(bookingUrl);
  const logo = resolveMediaUrl(businessLogoUrl);
  const serviceImg = resolveMediaUrl(serviceImageUrl);

  // Theme-specific styling classes
  const themeStyles = {
    light: {
      cardBg: "bg-slate-50 border-slate-200 text-slate-900",
      headerBg: "bg-white border-slate-200/80 shadow-sm",
      textPrimary: "text-slate-900",
      textSecondary: "text-slate-600",
      textMuted: "text-slate-400",
      badgeMerchant: "bg-emerald-50 text-emerald-700 border-emerald-200",
      badgeType: "bg-slate-100 text-slate-700 border-slate-200",
      priceBg: "bg-slate-900 text-white shadow-md shadow-slate-900/10",
      depositBadge: "bg-amber-50 text-amber-800 border-amber-200",
      detailBoxBg: "bg-white border-slate-200/80 shadow-xs",
      qrBoxBg: "bg-white border-slate-200 shadow-md",
      brandWatermark: "text-slate-400",
      accentBorder: "border-emerald-500",
    },
    onyx: {
      cardBg: "bg-slate-950 border-slate-800 text-white",
      headerBg: "bg-slate-900/90 border-slate-800 shadow-xl",
      textPrimary: "text-white",
      textSecondary: "text-slate-300",
      textMuted: "text-slate-500",
      badgeMerchant: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      badgeType: "bg-slate-800 text-slate-200 border-slate-700",
      priceBg: "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20 font-bold",
      depositBadge: "bg-amber-500/10 text-amber-300 border-amber-500/20",
      detailBoxBg: "bg-slate-900/80 border-slate-800",
      qrBoxBg: "bg-white border-slate-700 shadow-2xl",
      brandWatermark: "text-slate-500",
      accentBorder: "border-emerald-400",
    },
    sapphire: {
      cardBg: "bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 border-indigo-800/50 text-white",
      headerBg: "bg-indigo-900/40 border-indigo-500/30 backdrop-blur-md shadow-xl",
      textPrimary: "text-white",
      textSecondary: "text-indigo-100/90",
      textMuted: "text-indigo-300/60",
      badgeMerchant: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
      badgeType: "bg-indigo-900/60 text-indigo-200 border-indigo-700/50",
      priceBg: "bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-lg shadow-amber-500/20 font-bold",
      depositBadge: "bg-amber-400/15 text-amber-300 border-amber-400/30",
      detailBoxBg: "bg-indigo-950/60 border-indigo-800/40",
      qrBoxBg: "bg-white border-indigo-400/40 shadow-2xl",
      brandWatermark: "text-indigo-300/60",
      accentBorder: "border-amber-400",
    },
    emerald: {
      cardBg: "bg-gradient-to-br from-emerald-950 via-teal-950 to-slate-950 border-emerald-800/50 text-white",
      headerBg: "bg-emerald-900/40 border-emerald-500/30 backdrop-blur-md shadow-xl",
      textPrimary: "text-white",
      textSecondary: "text-emerald-100/90",
      textMuted: "text-emerald-300/60",
      badgeMerchant: "bg-emerald-400/20 text-emerald-200 border-emerald-400/40",
      badgeType: "bg-emerald-900/60 text-emerald-200 border-emerald-700/50",
      priceBg: "bg-gradient-to-r from-emerald-400 to-teal-400 text-slate-950 shadow-lg shadow-emerald-400/20 font-bold",
      depositBadge: "bg-amber-400/15 text-amber-300 border-amber-400/30",
      detailBoxBg: "bg-emerald-950/60 border-emerald-800/40",
      qrBoxBg: "bg-white border-emerald-400/40 shadow-2xl",
      brandWatermark: "text-emerald-300/60",
      accentBorder: "border-emerald-400",
    },
  }[theme];

  return (
    <div
      className={`relative w-[440px] max-w-full overflow-hidden rounded-3xl border-2 p-6 sm:p-7 shadow-2xl transition-all ${themeStyles.cardBg} ${className}`}
    >
      {/* Decorative background ambient circles */}
      <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl" />

      {/* Card Header: Business Branding */}
      <div className={`flex items-center justify-between rounded-2xl border p-3.5 ${themeStyles.headerBg}`}>
        <div className="flex items-center gap-3 min-w-0">
          {logo ? (
            <img
              src={logo}
              alt={businessName}
              className="h-11 w-11 rounded-xl object-cover border border-black/10 shadow-xs shrink-0"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-slate-800 to-slate-950 text-white font-bold text-lg shadow-xs shrink-0">
              {businessName ? businessName.charAt(0).toUpperCase() : "K"}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className={`font-bold text-sm sm:text-base leading-snug truncate ${themeStyles.textPrimary}`}>
              {businessName || "Service Business"}
            </h3>
            {businessCategory && (
              <p className={`text-[11px] font-medium truncate ${themeStyles.textMuted}`}>
                {businessCategory}
              </p>
            )}
          </div>
        </div>

        <div className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold shrink-0 ${themeStyles.badgeMerchant}`}>
          <BadgeCheck className="h-3.5 w-3.5 text-emerald-500" />
          <span>Verified</span>
        </div>
      </div>

      {/* Service Hero Image (if available) */}
      {serviceImg && (
        <div className="mt-4 h-36 w-full overflow-hidden rounded-2xl border border-black/10 shadow-inner">
          <img src={serviceImg} alt={serviceName} className="h-full w-full object-cover" />
        </div>
      )}

      {/* Service Title & Description */}
      <div className="mt-5 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <h2 className={`text-xl sm:text-2xl font-black tracking-tight leading-tight ${themeStyles.textPrimary}`}>
            {serviceName || "Service Title"}
          </h2>
        </div>

        {serviceDescription && (
          <p className={`text-xs leading-relaxed line-clamp-2 ${themeStyles.textSecondary}`}>
            {serviceDescription}
          </p>
        )}
      </div>

      {/* Service Key Attributes & Price Tag */}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <div className={`flex items-center gap-2 rounded-xl border p-2.5 ${themeStyles.detailBoxBg}`}>
          <Clock className={`h-4 w-4 shrink-0 ${themeStyles.textMuted}`} />
          <div className="min-w-0">
            <p className={`text-[10px] uppercase font-bold tracking-wider ${themeStyles.textMuted}`}>Duration</p>
            <p className={`text-xs font-semibold ${themeStyles.textPrimary}`}>{serviceDuration} mins</p>
          </div>
        </div>

        <div className={`flex items-center gap-2 rounded-xl border p-2.5 ${themeStyles.detailBoxBg}`}>
          <Calendar className={`h-4 w-4 shrink-0 ${themeStyles.textMuted}`} />
          <div className="min-w-0">
            <p className={`text-[10px] uppercase font-bold tracking-wider ${themeStyles.textMuted}`}>Type</p>
            <p className={`text-xs font-semibold capitalize ${themeStyles.textPrimary}`}>{serviceAppointmentType}</p>
          </div>
        </div>
      </div>

      {/* Pricing & Deposit Banner */}
      <div className="mt-4 flex items-center justify-between rounded-2xl p-3 border border-black/5 bg-slate-500/5">
        <div>
          <span className={`text-[11px] font-medium block ${themeStyles.textMuted}`}>Service Fee</span>
          <span className={`text-2xl font-black tracking-tight ${themeStyles.textPrimary}`}>
            ₦{Number(servicePrice || 0).toLocaleString()}
          </span>
        </div>

        {serviceDeposit > 0 ? (
          <div className={`rounded-xl border px-3 py-1.5 text-right ${themeStyles.depositBadge}`}>
            <span className="text-[10px] font-bold uppercase tracking-wider block">Deposit</span>
            <span className="text-xs font-extrabold">₦{Number(serviceDeposit).toLocaleString()}</span>
          </div>
        ) : (
          <div className={`rounded-xl border px-3 py-1 text-center text-xs font-semibold ${themeStyles.badgeType}`}>
            Full Payment
          </div>
        )}
      </div>

      {/* QR Code & Scan CTA Section */}
      <div className="mt-5 flex items-center gap-4 rounded-2xl border p-3.5 bg-gradient-to-r from-emerald-500/5 to-indigo-500/5">
        <div className={`flex h-24 w-24 items-center justify-center rounded-xl p-1.5 shrink-0 ${themeStyles.qrBoxBg}`}>
          <img src={qrUrl} alt="Scan QR Code to Book" className="h-full w-full rounded-lg object-contain" />
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-1.5 text-emerald-600 font-bold text-xs">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Instant Client Booking</span>
          </div>
          <p className={`text-xs font-semibold leading-snug ${themeStyles.textPrimary}`}>
            Scan QR code with your phone camera to schedule & book online instantly.
          </p>
          <div className="flex items-center gap-1 text-[10px] font-medium text-emerald-700 mt-1">
            <ShieldCheck className="h-3 w-3" />
            <span>Secured via Paystack</span>
          </div>
        </div>
      </div>

      {/* Footer & Watermark */}
      <div className="mt-5 flex items-center justify-between pt-3 border-t border-black/10 text-[10px]">
        <span className={`font-mono text-[10px] truncate max-w-[220px] ${themeStyles.textMuted}`}>
          {bookingUrl.replace(/^https?:\/\//, "")}
        </span>

        <div className={`flex items-center gap-1 font-bold ${themeStyles.brandWatermark}`}>
          <span>Powered by</span>
          <span className="font-extrabold tracking-wide text-xs">Orheo</span>
        </div>
      </div>
    </div>
  );
}
