// Public multi-step booking flow for clients.

import React, { useState, useRef, useEffect } from "react";
import { useParams, useSearchParams } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  Calendar,
  Clock,
  Check,
  ArrowLeft,
  CreditCard,
  Sparkles,
  MessageCircle,
  X,
  Mic,
  MicOff,
  Send,
  ChevronLeft,
  ChevronRight,
  Star,
  Shield,
  Mail,
  User,
  FileText,
  CalendarPlus,
  Lock,
  Loader2,
} from "lucide-react";
import { api } from "../../../lib/api/client";
import {
  appointmentTypeLabels,
  formatHostLabel,
  resolvePublicLocation,
  type AppointmentFormat,
  type AppointmentType,
} from "../../../lib/types/service";
import { PhoneInput } from "../../components/forms/PhoneInput";
import { getDialCodeForCountry } from "../../../lib/data/locations";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Service {
  id: string;
  name: string;
  description: string;
  duration: number;
  scheduling_mode: "fixed" | "flexible" | "all_day";
  price: number;
  deposit: number;
  category: string;
  image: string;
  popular?: boolean;
  appointment_type: AppointmentType;
  location?: string;
  use_business_location: boolean;
  host_name?: string;
  host_title?: string;
  client_instructions?: string;
  buffer_minutes: number;
}

interface TimeSlot {
  time: string;
  available: boolean;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

type StepId = "service" | "datetime" | "details" | "payment" | "confirmation";

// ─── Data ────────────────────────────────────────────────────────────────────

function getUpcomingDates() {
  const dates: Array<{ key: string; day: string; num: number; month: string; available: boolean }> = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 1; i <= 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push({
      key: d.toISOString().split("T")[0],
      day: d.toLocaleDateString("en-US", { weekday: "short" }),
      num: d.getDate(),
      month: d.toLocaleDateString("en-US", { month: "short" }),
      available: d.getDay() !== 0,
    });
  }
  return dates;
}

const ALL_DATES = getUpcomingDates();

const STEP_LABELS = ["Service", "Date & Time", "Your Details", "Payment"];

function serviceDurationLabel(service: { scheduling_mode: string; duration: number }): string {
  if (service.scheduling_mode === "all_day") return "All day";
  if (service.scheduling_mode === "flexible") return `About ${service.duration} min`;
  return `${service.duration} min`;
}

// ─── AI responses ─────────────────────────────────────────────────────────────

function getAIResponse(input: string): string {
  const q = input.toLowerCase();
  if (q.includes("price") || q.includes("cost") || q.includes("how much"))
    return "Our treatments start at ₦120. Quick overview:\n\n• Swedish Massage — ₦120 (₦40 deposit)\n• Deep Tissue — ₦160 (₦55 deposit)\n• Signature Facial — ₦140 (₦45 deposit)\n• Hot Stone Ritual — ₦175 (₦60 deposit)\n\nDeposits are refundable if you cancel 24h+ in advance. Want to book?";
  if (q.includes("available") || q.includes("slot") || q.includes("open"))
    return "We have openings starting tomorrow! Morning (9–11 AM), afternoon (12–3 PM), and evening slots (4–6 PM) are available Monday through Saturday. Which treatment interests you?";
  if (q.includes("swedish") || q.includes("relax"))
    return "The Classic Swedish Massage (60 min, ₦120) is perfect for unwinding. It uses long, flowing strokes across the full body. Just ₦40 secures your spot — want me to walk you through booking?";
  if (q.includes("facial") || q.includes("skin"))
    return "Our Signature Facial (75 min, ₦140) is customized to your skin type — cleansing, exfoliation, and serums tailored on the day. A ₦45 deposit holds your appointment.";
  if (q.includes("hot stone"))
    return "The Hot Stone Ritual (90 min, ₦175) uses heated basalt stones to melt tension at a deeper level than hands alone. One of our most-booked treatments — ₦60 deposit required.";
  if (q.includes("cancel") || q.includes("reschedule"))
    return "No problem! You can cancel or reschedule at no cost up to 24 hours before your appointment. After that, the deposit is non-refundable. Need help with anything else?";
  if (q.includes("deposit") || q.includes("refund"))
    return "Deposits hold your time slot and are fully refundable with 24h+ notice. The balance is paid at your appointment. Deposits range from ₦40–₦60 depending on the service.";
  if (q.includes("hi") || q.includes("hello") || q.includes("hey"))
    return "Hi there! I'm the Lumière booking assistant. Tell me what you're looking for — a treatment type, availability, pricing — and I'll help you get booked in minutes.";
  if (q.includes("book") || q.includes("appointment"))
    return "I'd love to help you book! Use the steps on this page or just tell me: which service interests you, and when are you looking to come in?";
  if (q.includes("voice") || q.includes("speak") || q.includes("talk"))
    return "Voice mode is on — just speak your question or request and I'll respond. You can also type if you prefer. How can I help?";
  return "Happy to help! Ask me about pricing, services, availability, or what to expect — or just tap a service above to get started.";
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const brandPrimary = "var(--color-primary)";
const brandAccent = "var(--color-accent)";
const cream = "var(--color-background)";
const creamCard = "var(--color-input-background)";
const stone600 = "var(--color-foreground)";
const stone500 = "var(--color-muted-foreground)";
const stone400 = "var(--color-muted-foreground)";
const dark = "var(--color-foreground)";

const inputStyle: React.CSSProperties = {
  backgroundColor: creamCard,
  border: "1px solid transparent",
  color: dark,
  outline: "none",
  width: "100%",
  padding: "10px 14px",
  borderRadius: 12,
  fontSize: 14,
  fontFamily: "'DM Sans', sans-serif",
  transition: "border-color 0.15s",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function PublicBooking() {
  const { businessId } = useParams<{ businessId: string }>();
  const [searchParams] = useSearchParams();
  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState("");
  const [step, setStep] = useState<StepId>("service");
  const [service, setService] = useState<Service | null>(null);
  const [dateOffset, setDateOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlotIso, setSelectedSlotIso] = useState("");
  const [businessProfile, setBusinessProfile] = useState<{
    name: string;
    location?: string;
    country_code?: string;
    public_tagline?: string;
    public_description?: string;
    public_logo_url?: string;
  }>({ name: "Business" });
  const [appointmentFormat, setAppointmentFormat] = useState<AppointmentFormat | "">("");
  const [phoneCountryCode, setPhoneCountryCode] = useState("GH");
  const [phoneDialCode, setPhoneDialCode] = useState("+233");
  const [availableSlotIsos, setAvailableSlotIsos] = useState<string[]>([]);
  const [form, setForm] = useState({ name: "", email: "", phone: "", notes: "" });
  const [calendarLinks, setCalendarLinks] = useState<{
    googleCalendarUrl: string;
    icsDownloadPath: string;
  } | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [bookingError, setBookingError] = useState("");
  const [isBooking, setIsBooking] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "0",
      role: "assistant",
      content:
        "Hi! I'm your Lumière booking assistant. Ask me about services, pricing, availability — or just tell me what you need and I'll guide you through it.",
    },
  ]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const paymentHandledRef = useRef(false);

  const stepIndex = (["service", "datetime", "details", "payment", "confirmation"] as StepId[]).indexOf(step);
  const visibleDates = ALL_DATES.slice(dateOffset, dateOffset + 7);
  const selectedDateObj = ALL_DATES.find((d) => d.key === selectedDate);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Return from Paystack checkout — verify and show confirmation.
  useEffect(() => {
    if (!businessId || paymentHandledRef.current) return;
    const paymentFlag = searchParams.get("payment");
    const reference = searchParams.get("reference");
    const bookingId = searchParams.get("booking_id");
    if (paymentFlag !== "1" || !reference || !bookingId) return;

    paymentHandledRef.current = true;
    setIsBooking(true);
    setBookingError("");
    api
      .confirmPublicPayment(businessId, bookingId, reference)
      .then((confirmed) => {
        if (confirmed.google_calendar_url && confirmed.ics_download_path) {
          setCalendarLinks({
            googleCalendarUrl: confirmed.google_calendar_url,
            icsDownloadPath: confirmed.ics_download_path,
          });
        }
        setStep("confirmation");
      })
      .catch((err) => {
        setBookingError(err instanceof Error ? err.message : "Payment verification failed.");
        setStep("payment");
      })
      .finally(() => {
        setIsBooking(false);
      });
  }, [businessId, searchParams]);

  useEffect(() => {
    if (step === "payment" && (!service || !selectedSlotIso)) {
      setStep(service ? "datetime" : "service");
    }
  }, [step, service, selectedSlotIso]);

  useEffect(() => {
    if (!businessId) return;
    setServicesLoading(true);
    setServicesError("");
    const preselectedServiceId = searchParams.get("service");
    api
      .getPublicBusiness(businessId)
      .then((biz) => {
        setBusinessProfile({
          name: biz.name,
          location: biz.location,
          country_code: biz.country_code,
          public_tagline: biz.public_tagline,
          public_description: biz.public_description,
          public_logo_url: biz.public_logo_url,
        });
        if (biz.country_code) {
          setPhoneCountryCode(biz.country_code);
          setPhoneDialCode(getDialCodeForCountry(biz.country_code));
        }
      })
      .catch(() => null);
    api
      .listPublicServices(businessId)
      .then((rows) =>
        {
          const mapped = rows.map((row) => ({
            id: row.id,
            name: row.name,
            description: row.description ?? "",
            duration: row.duration_minutes,
            scheduling_mode: row.scheduling_mode ?? "fixed",
            price: row.price_amount,
            deposit: row.deposit_amount ?? 0,
            category: appointmentTypeLabels[row.appointment_type],
            appointment_type: row.appointment_type,
            location: row.location,
            use_business_location: row.use_business_location,
            host_name: row.host_name,
            host_title: row.host_title,
            client_instructions: row.client_instructions,
            buffer_minutes: row.buffer_minutes ?? 0,
            image:
              row.image_url ||
              "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=500&h=280&fit=crop&auto=format",
          }));
          setServices(mapped);
          if (preselectedServiceId) {
            const selected = mapped.find((s) => s.id === preselectedServiceId);
            if (selected) {
              setService(selected);
              setStep("datetime");
            }
          }
        }
      )
      .catch(() => {
        setServices([]);
        setServicesError("Unable to load this business services.");
      })
      .finally(() => setServicesLoading(false));
  }, [businessId, searchParams]);

  useEffect(() => {
    if (!businessId || !service || !selectedDate) {
      setAvailableSlotIsos([]);
      return;
    }
    const from = new Date(`${selectedDate}T00:00:00.000Z`);
    const to = new Date(`${selectedDate}T23:59:59.000Z`);
    api
      .listPublicAvailability(businessId, service.id, from.toISOString(), to.toISOString())
      .then((res) => {
        setAvailableSlotIsos(res.slots);
        if (service.scheduling_mode === "all_day") {
          setSelectedSlotIso(res.slots[0] ?? "");
        }
      })
      .catch(() => {
        setAvailableSlotIsos([]);
        if (service.scheduling_mode === "all_day") setSelectedSlotIso("");
      });
  }, [businessId, service, selectedDate]);

  const groupedSlots = availableSlotIsos.reduce<Record<string, string[]>>((acc, slotIso) => {
    const hour = new Date(slotIso).getHours();
    const label = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
    if (!acc[label]) acc[label] = [];
    acc[label].push(slotIso);
    return acc;
  }, {});

  function displayTime(slotIso: string): string {
    return new Date(slotIso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  function sendMessage(text?: string) {
    const content = text ?? chatInput;
    if (!content.trim()) return;
    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", content };
    const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: "assistant", content: getAIResponse(content) };
    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setChatInput("");
  }

  function resetBooking() {
    setStep("service");
    setService(null);
    setSelectedDate("");
    setSelectedSlotIso("");
    setAppointmentFormat("");
    setForm({ name: "", email: "", phone: "", notes: "" });
    setCalendarLinks(null);
  }

  function openCalendar(calendar: "google" | "ics") {
    if (!calendarLinks) return;
    if (calendar === "google") {
      window.open(calendarLinks.googleCalendarUrl, "_blank", "noopener,noreferrer");
      return;
    }
    window.location.assign(calendarLinks.icsDownloadPath);
  }

  async function handleDepositPayment() {
    if (!businessId || !service) {
      setBookingError("Missing business or service details.");
      return;
    }
    if (!selectedSlotIso) {
      setBookingError(
        service.scheduling_mode === "all_day"
          ? "Please select an available date before confirming your booking."
          : "Please select a time slot before confirming your booking."
      );
      setStep("datetime");
      return;
    }
    if (service.appointment_type === "hybrid" && !appointmentFormat) {
      setBookingError("Please choose whether you want to meet online or in person.");
      setStep("datetime");
      return;
    }

    const clientName = form.name.trim();
    const clientEmail = form.email.trim();
    const clientPhone = form.phone.trim();

    if (clientName.length < 2) {
      setBookingError("Please enter your full name (at least 2 characters).");
      setStep("details");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
      setBookingError("Please enter a valid email address.");
      setStep("details");
      return;
    }

    setIsBooking(true);
    try {
      setBookingError("");
      const idempotencyKey = `web-${Date.now()}`;
      const booking = await api.createPublicBooking(businessId, {
        service_id: service.id,
        start_at: selectedSlotIso,
        client_name: clientName,
        client_email: clientEmail,
        ...(clientPhone ? { client_phone: `${phoneDialCode}${clientPhone.replace(/\s+/g, "")}` } : {}),
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
        ...(service.appointment_type === "hybrid" && appointmentFormat
          ? { appointment_format: appointmentFormat }
          : {}),
        idempotency_key: idempotencyKey,
      });

      let confirmedBooking = booking;
      if (booking.payment_required && booking.payment_status === "pending") {
        if (booking.payment_authorization_url) {
          window.location.href = booking.payment_authorization_url;
          return;
        }
        // Fallback demo confirm when no Paystack URL is returned.
        confirmedBooking = await api.confirmPublicPayment(businessId, booking.id);
      }

      if (confirmedBooking.google_calendar_url && confirmedBooking.ics_download_path) {
        setCalendarLinks({
          googleCalendarUrl: confirmedBooking.google_calendar_url,
          icsDownloadPath: confirmedBooking.ics_download_path,
        });
      }

      setStep("confirmation");
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : "Unable to complete booking payment.");
    } finally {
      setIsBooking(false);
    }
  }

  const canProceedDetails =
    Boolean(form.name.trim() && form.email.trim() && form.phone.trim() && selectedSlotIso);

  const resolvedAppointmentFormat: AppointmentFormat | null = service
    ? service.appointment_type === "hybrid"
      ? appointmentFormat || null
      : service.appointment_type === "online"
        ? "online"
        : "onsite"
    : null;

  const appointmentLocation =
    service && resolvedAppointmentFormat
      ? resolvePublicLocation(service, businessProfile.location, resolvedAppointmentFormat)
      : null;

  const hostLabel = service ? formatHostLabel(service.host_name, service.host_title) : null;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: cream, fontFamily: "'DM Sans', sans-serif" }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header style={{ backgroundColor: "var(--color-card)", borderBottom: "1px solid var(--color-border)" }}>
        <div
          style={{
            maxWidth: 780,
            margin: "0 auto",
            padding: "18px 24px",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 14,
              background: `linear-gradient(135deg, ${brandPrimary} 0%, ${brandAccent} 100%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {businessProfile.public_logo_url ? (
              <img
                src={businessProfile.public_logo_url}
                alt={businessProfile.name}
                style={{ width: 30, height: 30, borderRadius: 8, objectFit: "cover" }}
              />
            ) : (
              <Sparkles size={18} color="#fff" />
            )}
          </div>
          <div>
            <h1
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: "1.25rem",
                fontWeight: 600,
                color: dark,
                lineHeight: 1.2,
              }}
            >
              {businessProfile.name}
            </h1>
            <p style={{ fontSize: 12, color: stone500, marginTop: 2 }}>
              {businessProfile.public_tagline || "Book your appointment"}
            </p>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                backgroundColor: "#4ade80",
                animation: "pulse 2s ease-in-out infinite",
              }}
            />
            <span style={{ fontSize: 12, color: stone500 }}>Accepting bookings</span>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "36px 24px 120px" }}>
        {/* ── Progress stepper ─────────────────────────────────────────────── */}
        {step !== "confirmation" && (
          <div style={{ marginBottom: 40 }}>
            <div style={{ display: "flex", alignItems: "flex-start" }}>
              {STEP_LABELS.map((label, i) => {
                const done = i < stepIndex;
                const active = i === stepIndex;
                return (
                  <div key={label} style={{ display: "flex", alignItems: "flex-start", flex: 1 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          backgroundColor: done ? brandAccent : active ? brandPrimary : "var(--color-muted)",
                          color: done || active ? "#fff" : stone400,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 13,
                          fontWeight: 600,
                          boxShadow: active ? `0 0 0 4px rgba(146,64,14,0.15)` : "none",
                          transition: "all 0.3s",
                        }}
                      >
                        {done ? <Check size={14} strokeWidth={2.5} /> : i + 1}
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          marginTop: 6,
                          whiteSpace: "nowrap",
                          color: active ? brandPrimary : done ? brandAccent : stone400,
                          fontWeight: active ? 600 : 400,
                        }}
                      >
                        {label}
                      </span>
                    </div>
                    {i < 3 && (
                      <div
                        style={{
                          flex: 1,
                          height: 1,
                          backgroundColor: i < stepIndex ? brandAccent : "var(--color-muted)",
                          marginTop: 16,
                          marginLeft: 8,
                          marginRight: 8,
                          transition: "background-color 0.4s",
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Steps ─────────────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {/* ── Step 1: Service ── */}
          {step === "service" && (
            <motion.div
              key="service"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.22 }}
            >
              <h2
                style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: "1.85rem",
                  fontWeight: 600,
                  color: dark,
                  marginBottom: businessProfile.public_description ? 6 : 28,
                }}
              >
                Choose a service
              </h2>
              {businessProfile.public_description && (
                <p style={{ fontSize: 14, color: stone500, marginBottom: 28, lineHeight: 1.6 }}>
                  {businessProfile.public_description}
                </p>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                  gap: 16,
                }}
              >
                {servicesLoading && (
                  <p style={{ fontSize: 14, color: stone500 }}>Loading services...</p>
                )}
                {!servicesLoading && servicesError && (
                  <p style={{ fontSize: 14, color: "#E74C3C" }}>{servicesError}</p>
                )}
                {!servicesLoading && !servicesError && services.length === 0 && (
                  <p style={{ fontSize: 14, color: stone500 }}>
                    No active services are available for this business yet.
                  </p>
                )}
                {services.map((svc) => (
                  <motion.button
                    key={svc.id}
                    onClick={() => {
                      setService(svc);
                      setAppointmentFormat("");
                      setStep("datetime");
                    }}
                    whileHover={{ y: -3 }}
                    transition={{ duration: 0.15 }}
                    style={{
                      textAlign: "left",
                      backgroundColor: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 20,
                      overflow: "hidden",
                      boxShadow: "0 1px 6px rgba(28,25,23,0.05)",
                      cursor: "pointer",
                      padding: 0,
                      display: "block",
                      width: "100%",
                    }}
                  >
                    {/* Image */}
                    <div style={{ position: "relative", height: 180, backgroundColor: "var(--color-muted)", overflow: "hidden" }}>
                      <img
                        src={svc.image}
                        alt={svc.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                      {svc.popular && (
                        <div
                          style={{
                            position: "absolute",
                            top: 12,
                            left: 12,
                            backgroundColor: brandPrimary,
                            color: "#fff",
                            fontSize: 11,
                            fontWeight: 600,
                            padding: "3px 8px",
                            borderRadius: 20,
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Star size={10} fill="#fff" /> Popular
                        </div>
                      )}
                      <div
                        style={{
                          position: "absolute",
                          top: 12,
                          right: 12,
                          backgroundColor: "var(--color-card)",
                          color: stone600,
                          fontSize: 11,
                          padding: "3px 8px",
                          borderRadius: 20,
                        }}
                      >
                        {svc.category}
                      </div>
                    </div>

                    {/* Info */}
                    <div style={{ padding: "16px 18px 18px" }}>
                      <p
                        style={{
                          fontFamily: "'Playfair Display', serif",
                          fontSize: "1rem",
                          fontWeight: 600,
                          color: dark,
                          marginBottom: 5,
                        }}
                      >
                        {svc.name}
                      </p>
                      <p style={{ fontSize: 13, color: stone500, lineHeight: 1.6, marginBottom: 8 }}>
                        {svc.description}
                      </p>
                      {(svc.host_name || svc.appointment_type !== "onsite") && (
                        <p style={{ fontSize: 12, color: stone500, marginBottom: 12 }}>
                          {formatHostLabel(svc.host_name, svc.host_title) && `With ${formatHostLabel(svc.host_name, svc.host_title)} · `}
                          {appointmentTypeLabels[svc.appointment_type]}
                        </p>
                      )}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span
                            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: stone500 }}
                          >
                            <Clock size={13} /> {serviceDurationLabel(svc)}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 600, color: dark }}>
                            ₦{svc.price}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            backgroundColor: "var(--color-accent)",
                            color: brandPrimary,
                            padding: "3px 9px",
                            borderRadius: 20,
                            fontWeight: 500,
                          }}
                        >
                          ₦{svc.deposit} deposit
                        </span>
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>

              {/* Trust bar */}
              <div
                style={{
                  marginTop: 36,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 32,
                  flexWrap: "wrap",
                }}
              >
                {[
                  { Icon: Shield, text: "Secure payments" },
                  { Icon: Calendar, text: "Free cancellation 24h" },
                  { Icon: Star, text: "4.9 · 380+ reviews" },
                ].map(({ Icon, text }) => (
                  <div
                    key={text}
                    style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: stone400 }}
                  >
                    <Icon size={13} /> {text}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── Step 2: Date & Time ── */}
          {step === "datetime" && service && (
            <motion.div
              key="datetime"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.22 }}
            >
              <button
                onClick={() => setStep("service")}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: stone500, marginBottom: 24, background: "none", border: "none", cursor: "pointer" }}
              >
                <ArrowLeft size={15} /> Back to services
              </button>

              {/* Service recap pill */}
              <div
                style={{
                  backgroundColor: "var(--color-accent)",
                  border: "1px solid rgba(146,64,14,0.14)",
                  borderRadius: 14,
                  padding: "12px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 28,
                }}
              >
                <img
                  src={service.image}
                  alt=""
                  style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover" }}
                />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: dark }}>{service.name}</p>
                  <p style={{ fontSize: 12, color: brandPrimary }}>
                    {serviceDurationLabel(service)} · ₦{service.price} · ₦{service.deposit} deposit
                  </p>
                </div>
              </div>

              <h2
                style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: "1.6rem",
                  fontWeight: 600,
                  color: dark,
                  marginBottom: 20,
                }}
              >
                Pick a date & time
              </h2>

              {/* Date picker */}
              <div
                style={{
                  backgroundColor: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 20,
                  padding: 20,
                  marginBottom: 14,
                  boxShadow: "0 1px 6px rgba(28,25,23,0.05)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: dark }}>
                    {new Date(2026, 5, 25 + dateOffset).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                  </span>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[
                      { Icon: ChevronLeft, disabled: dateOffset === 0, onClick: () => setDateOffset(Math.max(0, dateOffset - 7)) },
                      { Icon: ChevronRight, disabled: dateOffset >= 7, onClick: () => setDateOffset(Math.min(7, dateOffset + 7)) },
                    ].map(({ Icon, disabled, onClick }, i) => (
                      <button
                        key={i}
                        onClick={onClick}
                        disabled={disabled}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 8,
                          backgroundColor: disabled ? "transparent" : creamCard,
                          border: "none",
                          cursor: disabled ? "not-allowed" : "pointer",
                          opacity: disabled ? 0.3 : 1,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Icon size={16} color={stone500} />
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
                  {visibleDates.map((d) => {
                    const isSelected = selectedDate === d.key;
                    return (
                      <button
                        key={d.key}
                        disabled={!d.available}
                        onClick={() => { setSelectedDate(d.key); setSelectedSlotIso(""); }}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          padding: "10px 4px",
                          borderRadius: 12,
                          border: "none",
                          backgroundColor: isSelected ? brandPrimary : "transparent",
                          cursor: d.available ? "pointer" : "not-allowed",
                          opacity: d.available ? 1 : 0.3,
                          transition: "background-color 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          if (d.available && !isSelected)
                            (e.currentTarget as HTMLButtonElement).style.backgroundColor = creamCard;
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected)
                            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
                        }}
                      >
                        <span style={{ fontSize: 11, fontWeight: 500, color: isSelected ? "rgba(255,255,255,0.75)" : stone500 }}>
                          {d.day}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: isSelected ? "#fff" : dark, marginTop: 2 }}>
                          {d.num}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time slots / all-day confirmation */}
              <AnimatePresence>
                {selectedDate && service.scheduling_mode === "all_day" && (
                  <motion.div
                    key="allday"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{
                      backgroundColor: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 20,
                      padding: 20,
                      marginBottom: 18,
                      boxShadow: "0 1px 6px rgba(28,25,23,0.05)",
                      overflow: "hidden",
                    }}
                  >
                    <p style={{ fontSize: 13, fontWeight: 600, color: dark, marginBottom: 8 }}>
                      {selectedDateObj?.day}, {selectedDateObj?.month} {selectedDateObj?.num}
                    </p>
                    {selectedSlotIso ? (
                      <p style={{ fontSize: 13, color: stone500, margin: 0 }}>
                        This books the entire calendar day — no start time needed.
                      </p>
                    ) : (
                      <p style={{ fontSize: 13, color: stone500, margin: 0 }}>
                        This date is fully booked. Please pick another day.
                      </p>
                    )}
                  </motion.div>
                )}
                {selectedDate && service.scheduling_mode !== "all_day" && (
                  <motion.div
                    key="timeslots"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{
                      backgroundColor: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 20,
                      padding: 20,
                      marginBottom: 18,
                      boxShadow: "0 1px 6px rgba(28,25,23,0.05)",
                      overflow: "hidden",
                    }}
                  >
                    <p style={{ fontSize: 13, fontWeight: 600, color: dark, marginBottom: 8 }}>
                      Available times for{" "}
                      <span style={{ color: brandPrimary }}>
                        {selectedDateObj?.day}, {selectedDateObj?.month} {selectedDateObj?.num}
                      </span>
                    </p>
                    {service.scheduling_mode === "flexible" && (
                      <p style={{ fontSize: 12, color: stone500, marginBottom: 16 }}>
                        Pick a start time. Typical length: about {service.duration} minutes.
                      </p>
                    )}
                    {service.scheduling_mode !== "flexible" && <div style={{ marginBottom: 16 }} />}
                    {Object.entries(groupedSlots).map(([label, slots]) => (
                      <div key={label} style={{ marginBottom: 16 }}>
                        <p
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            color: stone400,
                            marginBottom: 8,
                          }}
                        >
                          {label}
                        </p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {slots.map((slotIso) => {
                            const slot = { time: displayTime(slotIso), available: true } as TimeSlot;
                            const isSelected = selectedSlotIso === slotIso;
                            return (
                              <button
                                key={slotIso}
                                disabled={!slot.available}
                                onClick={() => setSelectedSlotIso(slotIso)}
                                style={{
                                  padding: "8px 16px",
                                  borderRadius: 10,
                                  border: "none",
                                  fontSize: 13,
                                  fontWeight: 500,
                                  backgroundColor: isSelected ? brandPrimary : slot.available ? creamCard : "var(--color-muted)",
                                  color: isSelected ? "#fff" : slot.available ? stone600 : stone400,
                                  cursor: slot.available ? "pointer" : "not-allowed",
                                  transition: "all 0.15s",
                                  fontFamily: "'DM Sans', sans-serif",
                                }}
                                onMouseEnter={(e) => {
                                  if (slot.available && !isSelected)
                                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--color-accent)";
                                }}
                                onMouseLeave={(e) => {
                                  if (!isSelected)
                                    (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                                      slot.available ? creamCard : "var(--color-muted)";
                                }}
                              >
                                {slot.time}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    {Object.keys(groupedSlots).length === 0 && (
                      <p style={{ fontSize: 13, color: stone500 }}>
                        No available slots for this date. Please pick another day.
                      </p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {service.appointment_type === "hybrid" && selectedSlotIso && (
                <div
                  style={{
                    marginTop: 20,
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 16,
                    padding: 18,
                  }}
                >
                  <p style={{ fontSize: 13, fontWeight: 600, color: dark, marginBottom: 12 }}>
                    How would you like to attend?
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {(["online", "onsite"] as AppointmentFormat[]).map((format) => {
                      const selected = appointmentFormat === format;
                      return (
                        <button
                          key={format}
                          type="button"
                          onClick={() => setAppointmentFormat(format)}
                          style={{
                            padding: "12px 14px",
                            borderRadius: 12,
                            border: selected ? `2px solid ${brandPrimary}` : "1px solid var(--color-border)",
                            backgroundColor: selected ? "var(--color-accent)" : "var(--color-card)",
                            textAlign: "left",
                            cursor: "pointer",
                          }}
                        >
                          <p style={{ fontSize: 13, fontWeight: 600, color: dark }}>
                            {format === "online" ? "Online" : "In person"}
                          </p>
                          <p style={{ fontSize: 11, color: stone500, marginTop: 4 }}>
                            {format === "online"
                              ? "Video call link sent after booking"
                              : resolvePublicLocation(service, businessProfile.location, format) || "At the business location"}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <AnimatePresence>
                {selectedDate && selectedSlotIso && (service.appointment_type !== "hybrid" || appointmentFormat) && (
                  <motion.button
                    key="continue-dt"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setStep("details")}
                    style={{
                      width: "100%",
                      padding: "14px 0",
                      borderRadius: 14,
                      border: "none",
                      backgroundColor: brandPrimary,
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                    whileHover={{ backgroundColor: brandAccent } as never}
                  >
                    Continue to your details
                  </motion.button>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ── Step 3: Details ── */}
          {step === "details" && service && (
            <motion.div
              key="details"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.22 }}
            >
              <button
                onClick={() => setStep("datetime")}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: stone500, marginBottom: 24, background: "none", border: "none", cursor: "pointer" }}
              >
                <ArrowLeft size={15} /> Back
              </button>

              <h2
                style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: "1.6rem",
                  fontWeight: 600,
                  color: dark,
                  marginBottom: 6,
                }}
              >
                Your details
              </h2>
              <p style={{ fontSize: 14, color: stone500, marginBottom: 28 }}>
                We use this to send your confirmation and calendar invite.
              </p>

              {service.client_instructions && (
                <div
                  style={{
                    marginBottom: 20,
                    backgroundColor: "var(--color-accent)",
                    border: "1px solid rgba(146,64,14,0.14)",
                    borderRadius: 14,
                    padding: "14px 16px",
                    fontSize: 13,
                    color: stone600,
                    lineHeight: 1.6,
                  }}
                >
                  <strong style={{ color: dark }}>Before your visit:</strong> {service.client_instructions}
                </div>
              )}

              <div
                style={{
                  backgroundColor: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 20,
                  padding: 24,
                  boxShadow: "0 1px 6px rgba(28,25,23,0.05)",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  {[
                    { id: "name", label: "Full name", placeholder: "Alexandra Chen", Icon: User, type: "text", key: "name" },
                    { id: "email", label: "Email address", placeholder: "alex@example.com", Icon: Mail, type: "email", key: "email" },
                  ].map(({ id, label, placeholder, Icon, type, key }) => (
                    <div key={id}>
                      <label style={{ fontSize: 13, fontWeight: 600, color: dark, display: "block", marginBottom: 8 }}>
                        {label}
                      </label>
                      <div style={{ position: "relative" }}>
                        <Icon
                          size={15}
                          color={stone400}
                          style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }}
                        />
                        <input
                          type={type}
                          value={form[key as keyof typeof form]}
                          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                          placeholder={placeholder}
                          style={{ ...inputStyle, paddingLeft: 38 }}
                          onFocus={(e) => (e.target.style.borderColor = brandPrimary)}
                          onBlur={(e) => (e.target.style.borderColor = "transparent")}
                        />
                      </div>
                    </div>
                  ))}

                  <PhoneInput
                    countryCode={phoneCountryCode}
                    dialCode={phoneDialCode}
                    phoneNumber={form.phone}
                    onCountryCodeChange={(countryCode, dialCode) => {
                      setPhoneCountryCode(countryCode);
                      setPhoneDialCode(dialCode);
                    }}
                    onPhoneNumberChange={(phone) => setForm({ ...form, phone })}
                    idPrefix="booking-phone"
                  />

                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: dark, display: "block", marginBottom: 8 }}>
                      Anything we should know?{" "}
                      <span style={{ color: stone400, fontWeight: 400 }}>(optional)</span>
                    </label>
                    <div style={{ position: "relative" }}>
                      <FileText
                        size={15}
                        color={stone400}
                        style={{ position: "absolute", left: 13, top: 12 }}
                      />
                      <textarea
                        value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        placeholder="Skin sensitivities, areas to focus on, preferences..."
                        rows={3}
                        style={{ ...inputStyle, paddingLeft: 38, resize: "none" }}
                        onFocus={(e) => (e.target.style.borderColor = brandPrimary)}
                        onBlur={(e) => (e.target.style.borderColor = "transparent")}
                      />
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => { if (canProceedDetails) setStep("payment"); }}
                  style={{
                    width: "100%",
                    marginTop: 22,
                    padding: "13px 0",
                    borderRadius: 13,
                    border: "none",
                    backgroundColor: canProceedDetails ? brandPrimary : "var(--color-muted)",
                    color: canProceedDetails ? "#fff" : stone400,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: canProceedDetails ? "pointer" : "not-allowed",
                    fontFamily: "'DM Sans', sans-serif",
                    transition: "background-color 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    if (canProceedDetails)
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = brandAccent;
                  }}
                  onMouseLeave={(e) => {
                    if (canProceedDetails)
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = brandPrimary;
                  }}
                >
                  Continue to payment
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Step 4: Payment ── */}
          {step === "payment" && service && selectedSlotIso && (
            <motion.div
              key="payment"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.22 }}
            >
              <button
                onClick={() => setStep("details")}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: stone500, marginBottom: 24, background: "none", border: "none", cursor: "pointer" }}
              >
                <ArrowLeft size={15} /> Back
              </button>

              <h2
                style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: "1.6rem",
                  fontWeight: 600,
                  color: dark,
                  marginBottom: 6,
                }}
              >
                Secure your spot
              </h2>
              <p style={{ fontSize: 14, color: stone500, marginBottom: 28 }}>
                Pay the ₦{service.deposit} deposit now. Remaining ₦{service.price - service.deposit} due at your appointment.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
                  {/* Card visual */}
                  <div
                    style={{
                      background: `linear-gradient(135deg, ${brandPrimary} 0%, ${brandAccent} 55%, ${brandPrimary} 100%)`,
                      borderRadius: 20,
                      padding: "28px 28px 24px",
                      position: "relative",
                      overflow: "hidden",
                      minHeight: 170,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: -40,
                        right: -40,
                        width: 200,
                        height: 200,
                        borderRadius: "50%",
                        background: "rgba(255,255,255,0.07)",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        bottom: -60,
                        left: -20,
                        width: 160,
                        height: 160,
                        borderRadius: "50%",
                        background: "rgba(255,255,255,0.05)",
                      }}
                    />
                    <div style={{ position: "relative" }}>
                        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 28 }}>
                        Deposit Payment · {businessProfile.name}
                      </p>
                      <p style={{ color: "#fff", fontSize: 20, fontWeight: 700, letterSpacing: "0.2em", marginBottom: 24 }}>
                        •••• •••• •••• ••••
                      </p>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                        <div>
                          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginBottom: 2 }}>Card holder</p>
                          <p style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{form.name || "Your name"}</p>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginBottom: 2 }}>Amount due</p>
                          <p style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>₦{service.deposit}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card form */}
                  <div
                    style={{
                      backgroundColor: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 20,
                      padding: 22,
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, color: dark, display: "block", marginBottom: 7 }}>Card number</label>
                        <div style={{ position: "relative" }}>
                          <CreditCard size={15} color={stone400} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} />
                          <input
                            placeholder="1234 5678 9012 3456"
                            style={{ ...inputStyle, paddingLeft: 38 }}
                            onFocus={(e) => (e.target.style.borderColor = brandPrimary)}
                            onBlur={(e) => (e.target.style.borderColor = "transparent")}
                          />
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        {[
                          { label: "Expiry", placeholder: "MM / YY" },
                          { label: "CVC", placeholder: "•••" },
                        ].map(({ label, placeholder }) => (
                          <div key={label}>
                            <label style={{ fontSize: 13, fontWeight: 600, color: dark, display: "block", marginBottom: 7 }}>{label}</label>
                            <input
                              placeholder={placeholder}
                              style={inputStyle}
                              onFocus={(e) => (e.target.style.borderColor = brandPrimary)}
                              onBlur={(e) => (e.target.style.borderColor = "transparent")}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, fontSize: 11, color: stone400 }}>
                      <Lock size={12} /> Encrypted with 256-bit SSL. We never store card details.
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <div
                  style={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 20,
                    padding: 20,
                  }}
                >
                  <p
                    style={{
                      fontFamily: "'Playfair Display', serif",
                      fontSize: "0.95rem",
                      fontWeight: 600,
                      color: dark,
                      marginBottom: 16,
                    }}
                  >
                    Booking summary
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {[
                      { label: "Service", value: service.name },
                      { label: "Format", value: resolvedAppointmentFormat === "online" ? "Online" : "In person" },
                      ...(hostLabel ? [{ label: "You'll meet", value: hostLabel }] : []),
                      ...(appointmentLocation ? [{ label: "Location", value: appointmentLocation }] : []),
                      { label: "Date", value: `${selectedDateObj?.day}, ${selectedDateObj?.month} ${selectedDateObj?.num}` },
                      ...(service.scheduling_mode === "all_day"
                        ? []
                        : [{ label: "Time", value: displayTime(selectedSlotIso) }]),
                      { label: "Duration", value: serviceDurationLabel(service) },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                        <span style={{ color: stone500 }}>{label}</span>
                        <span style={{ fontWeight: 500, color: dark }}>{value}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ borderTop: "1px solid var(--color-border)", marginTop: 14, paddingTop: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                      <span style={{ color: stone500 }}>Total</span>
                      <span style={{ fontWeight: 500, color: dark }}>₦{service.price}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                      <span style={{ color: stone500 }}>Due today</span>
                      <span style={{ fontWeight: 700, color: brandPrimary }}>₦{service.deposit}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4 }}>
                      <span style={{ color: stone400 }}>Due at appointment</span>
                      <span style={{ color: stone400 }}>₦{service.price - service.deposit}</span>
                    </div>
                  </div>

                  <button
                    onClick={handleDepositPayment}
                    disabled={isBooking}
                    style={{
                      width: "100%",
                      marginTop: 18,
                      padding: "13px 0",
                      borderRadius: 13,
                      border: "none",
                      backgroundColor: isBooking ? brandAccent : brandPrimary,
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: isBooking ? "not-allowed" : "pointer",
                      opacity: isBooking ? 0.9 : 1,
                      fontFamily: "'DM Sans', sans-serif",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      transition: "background-color 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      if (!isBooking) {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = brandAccent;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isBooking) {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = brandPrimary;
                      }
                    }}
                  >
                    {isBooking ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        Processing payment...
                      </>
                    ) : (
                      <>
                        <Lock size={15} /> Pay ₦{service.deposit} deposit
                      </>
                    )}
                  </button>
                  {bookingError && (
                    <p style={{ marginTop: 10, fontSize: 12, color: "#E74C3C" }}>{bookingError}</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Step 5: Confirmation ── */}
          {step === "confirmation" && service && (
            <motion.div
              key="confirmation"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.28 }}
              style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}
            >
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.15, type: "spring", stiffness: 220, damping: 16 }}
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: "50%",
                  backgroundColor: brandPrimary,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 24,
                }}
              >
                <Check size={38} color="#fff" strokeWidth={2.5} />
              </motion.div>

              <h2
                style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: "2.1rem",
                  fontWeight: 600,
                  color: dark,
                  marginBottom: 8,
                }}
              >
                You&apos;re all set
              </h2>
              <p style={{ fontSize: 14, color: stone500, marginBottom: 32, maxWidth: 380, lineHeight: 1.7 }}>
                A confirmation email with your calendar invite has been sent to{" "}
                <strong style={{ color: dark }}>{form.email}</strong>.
              </p>

              {/* Booking card */}
              <div
                style={{
                  width: "100%",
                  maxWidth: 400,
                  backgroundColor: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 20,
                  padding: 22,
                  marginBottom: 22,
                  boxShadow: "0 6px 24px rgba(28,25,23,0.09)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    paddingBottom: 16,
                    marginBottom: 16,
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  <img src={service.image} alt="" style={{ width: 46, height: 46, borderRadius: 12, objectFit: "cover" }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: dark }}>{service.name}</p>
                    <p style={{ fontSize: 12, color: stone500 }}>{businessProfile.name}</p>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      backgroundColor: "#dcfce7",
                      color: "#239B56",
                      padding: "4px 10px",
                      borderRadius: 20,
                    }}
                  >
                    Confirmed
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { label: "Format", value: resolvedAppointmentFormat === "online" ? "Online" : "In person" },
                    ...(hostLabel ? [{ label: "You'll meet", value: hostLabel }] : []),
                    ...(appointmentLocation ? [{ label: "Location", value: appointmentLocation }] : []),
                    { label: "Date", value: `${selectedDateObj?.day}, ${selectedDateObj?.month} ${selectedDateObj?.num}` },
                    ...(service.scheduling_mode === "all_day"
                      ? []
                      : [{ label: "Time", value: displayTime(selectedSlotIso) }]),
                    { label: "Duration", value: serviceDurationLabel(service) },
                    { label: "Deposit paid", value: `₦${service.deposit}` },
                    { label: "Balance due", value: `₦${service.price - service.deposit} at appointment` },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, textAlign: "left" }}>
                      <span style={{ color: stone500 }}>{label}</span>
                      <span style={{ fontWeight: 500, color: dark }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Calendar actions */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 400 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {[
                    { label: "Google Calendar", kind: "google" as const },
                    { label: "Apple Calendar", kind: "ics" as const },
                    { label: "Outlook", kind: "ics" as const },
                  ].map(({ label, kind }) => (
                    <button
                      key={label}
                      type="button"
                      disabled={!calendarLinks}
                      onClick={() => openCalendar(kind)}
                      style={{
                        padding: "10px 8px",
                        borderRadius: 12,
                        border: "1px solid var(--color-border)",
                        backgroundColor: "var(--color-card)",
                        fontSize: 11,
                        fontWeight: 500,
                        color: stone600,
                        cursor: calendarLinks ? "pointer" : "not-allowed",
                        opacity: calendarLinks ? 1 : 0.55,
                        fontFamily: "'DM Sans', sans-serif",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 5,
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        const el = e.currentTarget as HTMLButtonElement;
                        el.style.borderColor = brandPrimary;
                        el.style.color = brandPrimary;
                      }}
                      onMouseLeave={(e) => {
                        const el = e.currentTarget as HTMLButtonElement;
                        el.style.borderColor = "var(--color-border)";
                        el.style.color = stone600;
                      }}
                    >
                      <CalendarPlus size={16} />
                      {label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={resetBooking}
                  style={{
                    padding: "12px 0",
                    borderRadius: 13,
                    border: "none",
                    backgroundColor: creamCard,
                    color: stone600,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                    transition: "background-color 0.15s",
                  }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--color-accent)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = creamCard)}
                >
                  Book another appointment
                </button>
              </div>

              <p style={{ marginTop: 28, fontSize: 12, color: stone400 }}>
                Need to cancel or reschedule? Email{" "}
                <a href="mailto:hello@lumierewellness.com" style={{ color: brandPrimary }}>
                  hello@lumierewellness.com
                </a>
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── AI Chat Widget ─────────────────────────────────────────────────── */}
      <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 50 }}>
        <AnimatePresence>
          {chatOpen && (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 20, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.94 }}
              transition={{ duration: 0.2 }}
              style={{
                position: "absolute",
                bottom: 72,
                right: 0,
                width: 320,
                height: 440,
                backgroundColor: "var(--color-card)",
                borderRadius: 20,
                border: "1px solid var(--color-border)",
                boxShadow: "0 24px 64px rgba(28,25,23,0.18)",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              {/* Chat header */}
              <div
                style={{
                  padding: "14px 16px",
                  backgroundColor: brandPrimary,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    backgroundColor: "rgba(255,255,255,0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Sparkles size={15} color="#fff" />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>Lumière Assistant</p>
                  <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 11 }}>AI · Book by chat or voice</p>
                </div>
                <button
                  onClick={() => setVoiceActive(!voiceActive)}
                  title={voiceActive ? "Disable voice" : "Enable voice"}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    backgroundColor: voiceActive ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.15)",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "background-color 0.15s",
                  }}
                >
                  {voiceActive ? <Mic size={14} color="#fff" /> : <MicOff size={14} color="rgba(255,255,255,0.7)" />}
                </button>
                <button
                  onClick={() => setChatOpen(false)}
                  style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 2 }}
                >
                  <X size={16} color="rgba(255,255,255,0.8)" />
                </button>
              </div>

              {/* Voice indicator */}
              {voiceActive && (
                <div
                  style={{
                    padding: "8px 14px",
                    backgroundColor: "var(--color-accent)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 11,
                    color: brandPrimary,
                    flexShrink: 0,
                  }}
                >
                  <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
                    {[6, 10, 8, 12, 7].map((h, i) => (
                      <div
                        key={i}
                        style={{
                          width: 3,
                          height: h,
                          backgroundColor: brandAccent,
                          borderRadius: 4,
                          animation: `bounce ${0.5 + i * 0.08}s ease-in-out infinite alternate`,
                        }}
                      />
                    ))}
                  </div>
                  Voice mode active — speak your request
                </div>
              )}

              {/* Messages */}
              <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 6 }}
                  >
                    {msg.role === "assistant" && (
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          backgroundColor: creamCard,
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          marginBottom: 2,
                        }}
                      >
                        <Sparkles size={11} color={brandAccent} />
                      </div>
                    )}
                    <div
                      style={{
                        maxWidth: "78%",
                        padding: "9px 12px",
                        fontSize: 12,
                        lineHeight: 1.6,
                        whiteSpace: "pre-line",
                        backgroundColor: msg.role === "user" ? brandPrimary : creamCard,
                        color: msg.role === "user" ? "#fff" : dark,
                        borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {/* Quick replies */}
              {messages.length <= 2 && (
                <div style={{ padding: "0 12px 10px", display: "flex", flexWrap: "wrap", gap: 6, flexShrink: 0 }}>
                  {["What are the prices?", "What's available this week?", "Tell me about facials"].map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      style={{
                        fontSize: 11,
                        padding: "5px 10px",
                        borderRadius: 20,
                        border: "none",
                        backgroundColor: creamCard,
                        color: stone600,
                        cursor: "pointer",
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {/* Input */}
              <div
                style={{
                  padding: "10px 12px",
                  borderTop: "1px solid var(--color-border)",
                  display: "flex",
                  gap: 8,
                  flexShrink: 0,
                }}
              >
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  placeholder={voiceActive ? "Listening… or type here" : "Ask me anything…"}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "none",
                    backgroundColor: creamCard,
                    fontSize: 12,
                    color: dark,
                    outline: "none",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                />
                <button
                  onClick={() => sendMessage()}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    border: "none",
                    backgroundColor: brandPrimary,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    transition: "background-color 0.15s",
                  }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = brandAccent)}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = brandPrimary)}
                >
                  <Send size={14} color="#fff" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* FAB */}
        <motion.button
          whileHover={{ scale: 1.07 }}
          whileTap={{ scale: 0.94 }}
          onClick={() => setChatOpen(!chatOpen)}
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            backgroundColor: chatOpen ? "#57534e" : brandPrimary,
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 8px 28px rgba(146,64,14,0.35)",
            position: "relative",
            transition: "background-color 0.2s",
          }}
        >
          {chatOpen ? <X size={20} color="#fff" /> : <MessageCircle size={20} color="#fff" />}
          {!chatOpen && (
            <div
              style={{
                position: "absolute",
                top: -4,
                right: -4,
                width: 22,
                height: 22,
                borderRadius: "50%",
                backgroundColor: brandPrimary,
                color: "#fff",
                fontSize: 9,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "2px solid var(--color-background)",
                letterSpacing: "-0.02em",
              }}
            >
              AI
            </div>
          )}
        </motion.button>
      </div>

      <style>{`
        @keyframes bounce {
          from { transform: scaleY(0.6); }
          to { transform: scaleY(1.4); }
        }
      `}</style>
    </div>
  );
}
