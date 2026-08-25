// Public multi-step booking flow for clients.

import React, { useState, useRef, useEffect, useMemo } from "react";
import { useParams, useSearchParams } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  Calendar,
  Clock,
  Check,
  ArrowLeft,
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
  Download,
} from "lucide-react";
import { api, type AiStreamEvent, type PublicBookingResponse } from "../../../lib/api/client";
import {
  appointmentTypeLabels,
  formatHostLabel,
  resolvePublicLocation,
  type AppointmentFormat,
  type AppointmentType,
} from "../../../lib/types/service";
import { PhoneInput } from "../../components/forms/PhoneInput";
import { BrandLoader } from "../../components/brand/BrandLoader";
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
  booking_type: "general" | "listing";
  listing_ids: string[];
  location?: string;
  use_business_location: boolean;
  host_name?: string;
  host_title?: string;
  client_instructions?: string;
  buffer_minutes: number;
}

interface ListingOption {
  id: string;
  name: string;
  description?: string;
  status: "available" | "reserved" | "sold" | "hidden";
  image_urls: string[];
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

type ActivityStep = {
  id: string;
  label: string;
  status: "running" | "done";
};

function handlePublicStreamEvent(
  event: AiStreamEvent,
  setActivitySteps: React.Dispatch<React.SetStateAction<ActivityStep[]>>,
  aiMessageId: string,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setAiThreadId: React.Dispatch<React.SetStateAction<string | undefined>>,
) {
  if (event.type === "status") {
    setActivitySteps([{ id: "status", label: event.text, status: "running" }]);
    return;
  }
  if (event.type === "tool_start") {
    setActivitySteps((prev) => {
      const done = prev.map((step) => ({ ...step, status: "done" as const }));
      return [...done, { id: `tool-${event.name}`, label: event.label || event.name, status: "running" }];
    });
    return;
  }
  if (event.type === "tool_end") {
    setActivitySteps((prev) =>
      prev.map((step) => (step.id === `tool-${event.name}` ? { ...step, status: "done" } : step)),
    );
    return;
  }
  if (event.type === "token") {
    setMessages((prev) =>
      prev.map((msg) => (msg.id === aiMessageId ? { ...msg, content: msg.content + event.text } : msg)),
    );
    return;
  }
  if (event.type === "final") {
    setAiThreadId(event.thread_id);
    setMessages((prev) =>
      prev.map((msg) => (msg.id === aiMessageId ? { ...msg, content: event.reply } : msg)),
    );
    setActivitySteps([]);
  }
}

type StepId = "service" | "listing" | "datetime" | "details" | "payment" | "confirmation";

// ─── Data ────────────────────────────────────────────────────────────────────

function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getUpcomingDates(totalDays = 56) {
  const dates: Array<{ key: string; day: string; num: number; month: string; available: boolean }> = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 1; i <= totalDays; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push({
      key: localDateKey(d),
      day: d.toLocaleDateString("en-US", { weekday: "short" }),
      num: d.getDate(),
      month: d.toLocaleDateString("en-US", { month: "short" }),
      available: d.getDay() !== 0,
    });
  }
  return dates;
}

const BASE_STEP_LABELS = ["Service", "Date & Time", "Your Details", "Payment"];
const LISTING_STEP_LABELS = ["Service", "Product", "Date & Time", "Your Details", "Payment"];
const PENDING_PAYMENT_KEY = "orheo_pending_public_payment";

function serviceDurationLabel(service: { scheduling_mode: string; duration: number }): string {
  if (service.scheduling_mode === "all_day") return "All day";
  if (service.scheduling_mode === "flexible") return `About ${service.duration} min`;
  return `${service.duration} min`;
}

// ─── AI responses ─────────────────────────────────────────────────────────────

function assistantIntro(businessName: string): string {
  const name = businessName.trim() || "this business";
  return `Hi! I'm the ${name} booking assistant. Ask me about services, pricing, availability — or just tell me what you need and I'll guide you through it.`;
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function localPhoneFromStored(stored: string | null | undefined, dialCode: string): string {
  if (!stored) return "";
  const digits = stored.replace(/\s+/g, "");
  if (dialCode && digits.startsWith(dialCode)) return digits.slice(dialCode.length);
  return stored;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PublicBooking() {
  const { businessId } = useParams<{ businessId: string }>();
  const [searchParams] = useSearchParams();
  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState("");
  const [step, setStep] = useState<StepId>("service");
  const [service, setService] = useState<Service | null>(null);
  const [serviceListings, setServiceListings] = useState<ListingOption[]>([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [selectedListing, setSelectedListing] = useState<ListingOption | null>(null);
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
    contact_email?: string | null;
    help_email?: string | null;
  }>({ name: "Business" });
  const [appointmentFormat, setAppointmentFormat] = useState<AppointmentFormat | "">("");
  const [phoneCountryCode, setPhoneCountryCode] = useState("GH");
  const [phoneDialCode, setPhoneDialCode] = useState("+233");
  const [availableSlotIsos, setAvailableSlotIsos] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", notes: "" });
  const [returningClient, setReturningClient] = useState<{ first_name: string; last_name: string } | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<PublicBookingResponse | null>(null);
  const [calendarLinks, setCalendarLinks] = useState<{
    googleCalendarUrl: string;
    icsDownloadPath: string;
  } | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [bookingError, setBookingError] = useState("");
  const [isBooking, setIsBooking] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState<"download" | "email" | null>(null);
  const [receiptMessage, setReceiptMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "0",
      role: "assistant",
      content: assistantIntro("this business"),
    },
  ]);
  const [aiThreadId, setAiThreadId] = useState<string | undefined>(undefined);
  const [aiBusy, setAiBusy] = useState(false);
  const [activitySteps, setActivitySteps] = useState<ActivityStep[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const paymentHandledRef = useRef(false);

  function readPendingPayment() {
    try {
      const raw = localStorage.getItem(PENDING_PAYMENT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { businessId: string; bookingId: string; reference?: string };
      if (!parsed?.businessId || !parsed?.bookingId) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function clearPendingPayment() {
    localStorage.removeItem(PENDING_PAYMENT_KEY);
  }

  function savePendingPayment(data: { businessId: string; bookingId: string; reference?: string | null }) {
    localStorage.setItem(
      PENDING_PAYMENT_KEY,
      JSON.stringify({
        businessId: data.businessId,
        bookingId: data.bookingId,
        reference: data.reference || undefined,
      })
    );
  }

  const usesListingFlow = service?.booking_type === "listing";
  const stepOrder: StepId[] = usesListingFlow
    ? ["service", "listing", "datetime", "details", "payment", "confirmation"]
    : ["service", "datetime", "details", "payment", "confirmation"];
  const stepLabels = usesListingFlow ? LISTING_STEP_LABELS : BASE_STEP_LABELS;
  const stepIndex = stepOrder.indexOf(step);
  const allDates = useMemo(() => getUpcomingDates(56), []);
  const visibleDates = allDates.slice(dateOffset, dateOffset + 7);
  const selectedDateObj = allDates.find((d) => d.key === selectedDate);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Return from Paystack checkout — verify and show confirmation (UI state is lost on redirect).
  useEffect(() => {
    if (!businessId || paymentHandledRef.current) return;
    const paymentFlag = searchParams.get("payment");
    const urlReference = searchParams.get("reference") || searchParams.get("trxref");
    const pending = readPendingPayment();
    const fromPending = pending?.businessId === businessId ? pending : null;
    const reference = urlReference || fromPending?.reference || null;
    const bookingId = searchParams.get("booking_id") || fromPending?.bookingId || null;
    if (paymentFlag !== "1" && !urlReference && !fromPending) return;
    if (!reference || !bookingId) return;

    paymentHandledRef.current = true;
    setIsBooking(true);
    setBookingError("");
    setStep("confirmation");
    api
      .confirmPublicPayment(businessId, bookingId, reference)
      .then((confirmed) => {
        applyConfirmedBooking(confirmed);
        clearPendingPayment();
        const path = window.location.pathname;
        window.history.replaceState({}, "", path);
      })
      .catch((err) => {
        setBookingError(err instanceof Error ? err.message : "Payment verification failed.");
        clearPendingPayment();
        const path = window.location.pathname;
        window.history.replaceState({}, "", path);
      })
      .finally(() => {
        setIsBooking(false);
      });
  }, [businessId, searchParams]);

  useEffect(() => {
    if (!businessId || !service || service.booking_type !== "listing") {
      setServiceListings([]);
      setSelectedListing(null);
      setListingsLoading(false);
      return;
    }
    let cancelled = false;
    setListingsLoading(true);
    setServiceListings([]);
    api
      .listPublicServiceListings(businessId, service.id)
      .then((rows) => {
        if (cancelled) return;
        setServiceListings(rows);
        setSelectedListing((prev) => {
          if (!prev) return null;
          return rows.find((listing) => listing.id === prev.id) ?? null;
        });
      })
      .catch(() => {
        if (cancelled) return;
        setServiceListings([]);
      })
      .finally(() => {
        if (!cancelled) setListingsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, service]);

  useEffect(() => {
    // Don't kick users off payment/confirmation after Paystack redirect (local slot state is empty).
    if (paymentHandledRef.current || confirmedBooking) return;
    if (step === "payment" && (!service || !selectedSlotIso)) {
      if (!service) {
        setStep("service");
      } else if (service.booking_type === "listing" && !selectedListing) {
        setStep("listing");
      } else {
        setStep("datetime");
      }
    }
  }, [step, service, selectedListing, selectedSlotIso, confirmedBooking]);

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
          contact_email: biz.contact_email,
          help_email: biz.help_email,
        });
        if (biz.name?.trim()) {
          setMessages((prev) => {
            if (prev.length === 1 && prev[0].id === "0") {
              return [{ ...prev[0], content: assistantIntro(biz.name) }];
            }
            return prev;
          });
        }
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
            booking_type: row.booking_type ?? "general",
            listing_ids: row.listing_ids ?? [],
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
              setSelectedListing(null);
              setStep(selected.booking_type === "listing" ? "listing" : "datetime");
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
    if (
      !businessId ||
      !service ||
      !selectedDate ||
      (service.booking_type === "listing" && !selectedListing)
    ) {
      setAvailableSlotIsos([]);
      setSlotsLoading(false);
      return;
    }
    // A later date selection must win even if an earlier request resolves after it.
    let cancelled = false;
    const from = new Date(`${selectedDate}T00:00:00.000Z`);
    const to = new Date(`${selectedDate}T23:59:59.000Z`);
    setSlotsLoading(true);
    setAvailableSlotIsos([]);
    api
      .listPublicAvailability(
        businessId,
        service.id,
        from.toISOString(),
        to.toISOString(),
        service.booking_type === "listing" ? selectedListing?.id : undefined
      )
      .then((res) => {
        if (cancelled) return;
        setAvailableSlotIsos(res.slots);
        if (service.scheduling_mode === "all_day") {
          setSelectedSlotIso(res.slots[0] ?? "");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setAvailableSlotIsos([]);
        if (service.scheduling_mode === "all_day") setSelectedSlotIso("");
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [businessId, service, selectedDate, selectedListing]);

  useEffect(() => {
    if (!businessId) return;
    const email = form.email.trim();
    if (!EMAIL_RE.test(email)) {
      setReturningClient(null);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void api
        .lookupPublicClient(businessId, email)
        .then((result) => {
          if (cancelled) return;
          if (result.found) {
            setReturningClient({ first_name: result.first_name, last_name: result.last_name });
            setForm((prev) => ({
              ...prev,
              firstName: result.first_name || prev.firstName,
              lastName: result.last_name || prev.lastName,
              phone: prev.phone.trim() ? prev.phone : localPhoneFromStored(result.phone, phoneDialCode),
            }));
          } else {
            setReturningClient(null);
          }
        })
        .catch(() => {
          if (!cancelled) setReturningClient(null);
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [businessId, form.email]);

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

  async function sendMessage(text?: string) {
    const content = text ?? chatInput;
    if (!content.trim() || aiBusy || !businessId) return;
    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", content };
    setMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setAiBusy(true);
    setActivitySteps([{ id: "status", label: "Starting…", status: "running" }]);
    const aiMessageId = `${Date.now()}-ai`;
    setMessages((prev) => [...prev, { id: aiMessageId, role: "assistant", content: "" }]);
    try {
      await api.publicAiChatStream(
        businessId,
        {
          message: content.trim(),
          thread_id: aiThreadId,
        },
        (event) => {
          handlePublicStreamEvent(event, setActivitySteps, aiMessageId, setMessages, setAiThreadId);
        },
      );
    } catch {
      setActivitySteps([]);
      setMessages((prev) =>
        prev
          .filter((msg) => msg.id !== aiMessageId)
          .concat({
            id: `${Date.now()}-err`,
            role: "assistant",
            content: "I couldn't reach the booking assistant just now. Please try again in a moment.",
          }),
      );
    } finally {
      setAiBusy(false);
      setActivitySteps([]);
    }
  }

  function applyConfirmedBooking(confirmed: PublicBookingResponse) {
    setConfirmedBooking(confirmed);
    if (confirmed.client_email || confirmed.client_name || confirmed.client_first_name) {
      setForm((prev) => ({
        ...prev,
        email: confirmed.client_email || prev.email,
        firstName: confirmed.client_first_name || prev.firstName,
        lastName: confirmed.client_last_name || prev.lastName,
      }));
    }
    if (confirmed.start_at) {
      setSelectedSlotIso(confirmed.start_at);
      setSelectedDate(confirmed.start_at.slice(0, 10));
    }
    if (confirmed.appointment_format) {
      setAppointmentFormat(confirmed.appointment_format);
    }
    if (confirmed.service_id) {
      setService((prev) => {
        if (prev && prev.id === confirmed.service_id) return prev;
        return {
          id: confirmed.service_id,
          name: confirmed.service_name || "Appointment",
          description: "",
          duration: confirmed.service_duration_minutes || 60,
          scheduling_mode: (confirmed.scheduling_mode as Service["scheduling_mode"]) || "fixed",
          price: confirmed.service_price ?? 0,
          deposit: confirmed.service_deposit ?? 0,
          category: "",
          image: confirmed.service_image_url || "",
          appointment_type: "onsite",
          booking_type: confirmed.listing_id ? "listing" : "general",
          listing_ids: confirmed.listing_id ? [confirmed.listing_id] : [],
          location: confirmed.location || undefined,
          use_business_location: true,
          host_name: confirmed.host_name || undefined,
          host_title: confirmed.host_title || undefined,
          buffer_minutes: 0,
        };
      });
    }
    if (confirmed.listing_id) {
      setSelectedListing({
        id: confirmed.listing_id,
        name: confirmed.listing_name || "Selected listing",
        description: "",
        status: "available",
        image_urls: confirmed.listing_image_url ? [confirmed.listing_image_url] : [],
      });
    }
    if (confirmed.business_name) {
      setBusinessProfile((prev) => ({
        ...prev,
        name: confirmed.business_name || prev.name,
        contact_email: confirmed.business_contact_email ?? prev.contact_email,
        help_email: confirmed.business_help_email ?? prev.help_email,
      }));
    }
    if (confirmed.google_calendar_url && confirmed.ics_download_path) {
      setCalendarLinks({
        googleCalendarUrl: confirmed.google_calendar_url,
        icsDownloadPath: confirmed.ics_download_path,
      });
    }
    setStep("confirmation");
  }

  function resetBooking() {
    setStep("service");
    setService(null);
    setServiceListings([]);
    setSelectedListing(null);
    setSelectedDate("");
    setSelectedSlotIso("");
    setAppointmentFormat("");
    setForm({ firstName: "", lastName: "", email: "", phone: "", notes: "" });
    setReturningClient(null);
    setConfirmedBooking(null);
    setCalendarLinks(null);
    setReceiptBusy(null);
    setReceiptMessage("");
    paymentHandledRef.current = false;
    clearPendingPayment();
  }

  async function handleDownloadReceipt() {
    if (!businessId || !confirmedBooking?.id) return;
    setReceiptBusy("download");
    setReceiptMessage("");
    try {
      await api.downloadPublicReceipt(businessId, confirmedBooking.id);
      setReceiptMessage("Receipt downloaded. Open it and use Print → Save as PDF if you want a PDF.");
    } catch {
      setReceiptMessage("Could not download the receipt. Please try again.");
    } finally {
      setReceiptBusy(null);
    }
  }

  async function handleEmailReceipt() {
    if (!businessId || !confirmedBooking?.id) return;
    setReceiptBusy("email");
    setReceiptMessage("");
    try {
      const result = await api.emailPublicReceipt(businessId, confirmedBooking.id);
      setReceiptMessage(`Receipt and booking details sent to ${result.email}.`);
    } catch {
      setReceiptMessage("Could not send the receipt email. Please try again.");
    } finally {
      setReceiptBusy(null);
    }
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
    if (service.booking_type === "listing" && !selectedListing) {
      setBookingError("Please select a product before confirming your booking.");
      setStep("listing");
      return;
    }

    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const clientEmail = form.email.trim();
    const clientPhone = form.phone.trim();

    if (firstName.length < 1 || lastName.length < 1) {
      setBookingError("Please enter your first name and surname.");
      setStep("details");
      return;
    }
    if (!EMAIL_RE.test(clientEmail)) {
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
        ...(selectedListing ? { listing_id: selectedListing.id } : {}),
        start_at: selectedSlotIso,
        client_first_name: firstName,
        client_last_name: lastName,
        client_email: clientEmail,
        ...(clientPhone ? { client_phone: `${phoneDialCode}${clientPhone.replace(/\s+/g, "")}` } : {}),
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
        ...(service.appointment_type === "hybrid" && appointmentFormat
          ? { appointment_format: appointmentFormat }
          : {}),
        idempotency_key: idempotencyKey,
      });

      let confirmedBookingResponse = booking;
      const amountDue = service.deposit > 0 ? service.deposit : service.price;

      if (booking.payment_required && booking.payment_status === "pending") {
        if (booking.payment_authorization_url) {
          savePendingPayment({
            businessId,
            bookingId: booking.id,
            reference: booking.payment_reference,
          });
          window.location.href = booking.payment_authorization_url;
          return;
        }
        setBookingError(
          "Payment could not be started (no Paystack checkout URL). Ask the business to reconnect Paystack, then try again."
        );
        return;
      }

      if (!booking.payment_required && amountDue > 0) {
        setBookingError(
          "This business has not connected Paystack yet, so live checkout was skipped and the booking was confirmed without payment."
        );
      }

      applyConfirmedBooking(confirmedBookingResponse);
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : "Unable to complete booking payment.");
    } finally {
      setIsBooking(false);
    }
  }

  const canProceedDetails =
    Boolean(form.firstName.trim() && form.lastName.trim() && form.email.trim() && form.phone.trim() && selectedSlotIso);

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
              {stepLabels.map((label, i) => {
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
                    {i < stepLabels.length - 1 && (
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
                {servicesLoading && <BrandLoader label="Loading services" className="col-span-full" />}
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
                      setSelectedListing(null);
                      setSelectedDate("");
                      setSelectedSlotIso("");
                      setStep(svc.booking_type === "listing" ? "listing" : "datetime");
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

          {/* ── Step 2: Listing (conditional) ── */}
          {step === "listing" && service && service.booking_type === "listing" && (
            <motion.div
              key="listing"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.22 }}
            >
              <button
                onClick={() => setStep(service.booking_type === "listing" ? "listing" : "service")}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: stone500, marginBottom: 24, background: "none", border: "none", cursor: "pointer" }}
              >
                <ArrowLeft size={15} /> {service.booking_type === "listing" ? "Back to products" : "Back to services"}
              </button>

              <h2
                style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: "1.6rem",
                  fontWeight: 600,
                  color: dark,
                  marginBottom: 8,
                }}
              >
                Select a product
              </h2>
              <p style={{ fontSize: 14, color: stone500, marginBottom: 24 }}>
                Choose the exact property, vehicle, or item you want to book for {service.name}.
              </p>

              {listingsLoading && <BrandLoader label="Loading products" />}
              {!listingsLoading && serviceListings.length === 0 && (
                <p style={{ fontSize: 13, color: stone500 }}>
                  No available products for this service right now. Please try another service.
                </p>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                {serviceListings.map((listing) => {
                  const isSelected = selectedListing?.id === listing.id;
                  return (
                    <button
                      key={listing.id}
                      type="button"
                      onClick={() => {
                        setSelectedListing(listing);
                        setSelectedDate("");
                        setSelectedSlotIso("");
                      }}
                      style={{
                        textAlign: "left",
                        backgroundColor: "var(--color-card)",
                        border: isSelected ? `2px solid ${brandPrimary}` : "1px solid var(--color-border)",
                        borderRadius: 14,
                        padding: 0,
                        overflow: "hidden",
                        cursor: "pointer",
                      }}
                    >
                      {listing.image_urls[0] && (
                        <div style={{ height: 140, overflow: "hidden" }}>
                          <img src={listing.image_urls[0]} alt={listing.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        </div>
                      )}
                      <div style={{ padding: 14 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: dark }}>{listing.name}</p>
                        {listing.description && (
                          <p style={{ marginTop: 6, fontSize: 12, color: stone500, lineHeight: 1.5 }}>{listing.description}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedListing && (
                <motion.button
                  key="continue-listing"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setStep("datetime")}
                  style={{
                    width: "100%",
                    marginTop: 20,
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
                >
                  Continue to date & time
                </motion.button>
              )}
            </motion.div>
          )}

          {/* ── Step 3: Date & Time ── */}
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
                    {(visibleDates[0]
                      ? new Date(`${visibleDates[0].key}T00:00:00`)
                      : new Date()
                    ).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                  </span>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[
                      {
                        Icon: ChevronLeft,
                        disabled: dateOffset === 0,
                        onClick: () => setDateOffset(Math.max(0, dateOffset - 7)),
                      },
                      {
                        Icon: ChevronRight,
                        disabled: dateOffset >= Math.max(0, allDates.length - 7),
                        onClick: () =>
                          setDateOffset((prev) => Math.min(Math.max(0, allDates.length - 7), prev + 7)),
                      },
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
                    {slotsLoading ? (
                      <BrandLoader label="Checking availability" size="sm" />
                    ) : selectedSlotIso ? (
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
                    {slotsLoading && <BrandLoader label="Loading times" size="sm" />}
                    {!slotsLoading && Object.keys(groupedSlots).length === 0 && (
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
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: dark, display: "block", marginBottom: 8 }}>
                      Email address
                    </label>
                    <div style={{ position: "relative" }}>
                      <Mail
                        size={15}
                        color={stone400}
                        style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }}
                      />
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        placeholder="alex@example.com"
                        autoComplete="email"
                        style={{ ...inputStyle, paddingLeft: 38 }}
                        onFocus={(e) => (e.target.style.borderColor = brandPrimary)}
                        onBlur={(e) => (e.target.style.borderColor = "transparent")}
                      />
                    </div>
                  </div>

                  {returningClient && (
                    <div
                      style={{
                        backgroundColor: "var(--color-accent)",
                        border: "1px solid rgba(146,64,14,0.14)",
                        borderRadius: 14,
                        padding: "12px 14px",
                        fontSize: 13,
                        color: stone600,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Sparkles size={15} color={brandPrimary} />
                      <span>
                        Welcome back,{" "}
                        <strong style={{ color: dark }}>
                          {`${returningClient.first_name} ${returningClient.last_name}`.trim()}
                        </strong>
                      </span>
                    </div>
                  )}

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                    }}
                  >
                    {[
                      { id: "firstName", label: "First name", placeholder: "Alexandra", key: "firstName" as const },
                      { id: "lastName", label: "Surname", placeholder: "Chen", key: "lastName" as const },
                    ].map(({ id, label, placeholder, key }) => (
                      <div key={id}>
                        <label style={{ fontSize: 13, fontWeight: 600, color: dark, display: "block", marginBottom: 8 }}>
                          {label}
                        </label>
                        <div style={{ position: "relative" }}>
                          <User
                            size={15}
                            color={stone400}
                            style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }}
                          />
                          <input
                            type="text"
                            value={form[key]}
                            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                            placeholder={placeholder}
                            autoComplete={key === "firstName" ? "given-name" : "family-name"}
                            style={{ ...inputStyle, paddingLeft: 38 }}
                            onFocus={(e) => (e.target.style.borderColor = brandPrimary)}
                            onBlur={(e) => (e.target.style.borderColor = "transparent")}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

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
                {service.deposit > 0
                  ? `Pay ₦${service.deposit} now to secure your spot. Remaining ₦${Math.max(0, service.price - service.deposit)} is due at your appointment.`
                  : `Pay ₦${service.price} securely via Paystack to confirm your booking.`}
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
                <div
                  style={{
                    background: `linear-gradient(135deg, ${brandPrimary} 0%, ${brandAccent} 55%, ${brandPrimary} 100%)`,
                    borderRadius: 20,
                    padding: "28px 28px 24px",
                    position: "relative",
                    overflow: "hidden",
                    minHeight: 150,
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
                  <div style={{ position: "relative" }}>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 20 }}>
                      Secure checkout · {businessProfile.name}
                    </p>
                    <p style={{ color: "#fff", fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
                      ₦{service.deposit > 0 ? service.deposit : service.price}
                    </p>
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
                      Card, bank transfer, OPay, USSD, and more via Paystack
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 20,
                    padding: 22,
                  }}
                >
                  <p style={{ fontSize: 13, fontWeight: 600, color: dark, marginBottom: 12 }}>
                    Available payment methods
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {["Card", "Bank transfer", "Pay with bank / OPay", "USSD", "QR"].map((method) => (
                      <span
                        key={method}
                        style={{
                          fontSize: 12,
                          color: dark,
                          backgroundColor: creamCard,
                          border: "1px solid var(--color-border)",
                          borderRadius: 999,
                          padding: "6px 12px",
                        }}
                      >
                        {method}
                      </span>
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, fontSize: 11, color: stone400 }}>
                    <Lock size={12} /> You’ll choose your method on the secure Paystack checkout page. We never store card details.
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
                      ...(service.booking_type === "listing" && selectedListing
                        ? [{ label: "Listing", value: selectedListing.name }]
                        : []),
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
                      <span style={{ fontWeight: 700, color: brandPrimary }}>
                        ₦{service.deposit > 0 ? service.deposit : service.price}
                      </span>
                    </div>
                    {service.deposit > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4 }}>
                        <span style={{ color: stone400 }}>Due at appointment</span>
                        <span style={{ color: stone400 }}>₦{Math.max(0, service.price - service.deposit)}</span>
                      </div>
                    )}
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
                        Redirecting to Paystack...
                      </>
                    ) : (
                      <>
                        <Lock size={15} /> Continue to Paystack · ₦
                        {service.deposit > 0 ? service.deposit : service.price}
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
          {step === "confirmation" && (
            <motion.div
              key="confirmation"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.28 }}
              style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}
            >
              {isBooking && !confirmedBooking && (
                <>
                  <Loader2 size={36} color={brandPrimary} className="animate-spin" style={{ marginBottom: 16 }} />
                  <p style={{ fontSize: 14, color: stone500, marginBottom: 8 }}>Confirming your payment…</p>
                  <p style={{ fontSize: 12, color: stone400, maxWidth: 320, lineHeight: 1.5 }}>
                    Please wait while we verify your payment and prepare your receipt.
                  </p>
                </>
              )}

              {!isBooking && bookingError && !confirmedBooking && (
                <>
                  <h2
                    style={{
                      fontFamily: "'Playfair Display', serif",
                      fontSize: "1.8rem",
                      fontWeight: 600,
                      color: dark,
                      marginBottom: 8,
                    }}
                  >
                    {/not completed yet|still processing/i.test(bookingError)
                      ? "Payment still processing"
                      : "Payment unsuccessful"}
                  </h2>
                  <p style={{ fontSize: 14, color: "#E74C3C", marginBottom: 16, maxWidth: 380, lineHeight: 1.6 }}>
                    {bookingError}
                  </p>
                  <p style={{ fontSize: 13, color: stone500, marginBottom: 20, maxWidth: 380, lineHeight: 1.6 }}>
                    {/not completed yet|still processing/i.test(bookingError)
                      ? "If you were charged, this page can take a moment to confirm. Refresh once, and do not pay again until you see a failure."
                      : "You were not charged for a completed booking. The time slot is free again — you can start over and try a different payment method."}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (/not completed yet|still processing/i.test(bookingError) && businessId) {
                        window.location.reload();
                        return;
                      }
                      resetBooking();
                    }}
                    style={{
                      padding: "12px 20px",
                      borderRadius: 13,
                      border: "none",
                      backgroundColor: brandPrimary,
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {/not completed yet|still processing/i.test(bookingError) ? "Refresh status" : "Book again"}
                  </button>
                </>
              )}

              {(confirmedBooking || (service && !isBooking && !bookingError)) && (
                <>
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
                A confirmation email with your receipt and calendar invite
                {confirmedBooking?.payment_reference ? " (including payment reference)" : ""} has been sent to{" "}
                <strong style={{ color: dark }}>
                  {confirmedBooking?.client_email || form.email}
                </strong>
                . You can also download or resend it below.
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
                  {(confirmedBooking?.service_image_url || service?.image) && (
                    <img
                      src={confirmedBooking?.service_image_url || service?.image}
                      alt=""
                      style={{ width: 46, height: 46, borderRadius: 12, objectFit: "cover" }}
                    />
                  )}
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: dark }}>
                      {confirmedBooking?.service_name || service?.name}
                    </p>
                    <p style={{ fontSize: 12, color: stone500 }}>
                      {confirmedBooking?.business_name || businessProfile.name}
                    </p>
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
                  {(() => {
                    const confFormat =
                      confirmedBooking?.appointment_format ||
                      (resolvedAppointmentFormat === "online" ? "online" : "onsite");
                    const confHost =
                      confirmedBooking?.host_name ||
                      (confirmedBooking?.host_title
                        ? confirmedBooking.host_title
                        : hostLabel) ||
                      hostLabel;
                    const confLocation = confirmedBooking?.location || appointmentLocation;
                    const confStart = confirmedBooking?.start_at || selectedSlotIso;
                    const confDate = confStart
                      ? new Date(confStart).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })
                      : selectedDateObj
                        ? `${selectedDateObj.day}, ${selectedDateObj.month} ${selectedDateObj.num}`
                        : "—";
                    const confTime =
                      confirmedBooking?.is_all_day || service?.scheduling_mode === "all_day"
                        ? null
                        : confStart
                          ? displayTime(confStart)
                          : selectedSlotIso
                            ? displayTime(selectedSlotIso)
                            : null;
                    const confDuration =
                      confirmedBooking?.scheduling_mode === "all_day"
                        ? "All day"
                        : confirmedBooking?.service_duration_minutes
                          ? confirmedBooking.scheduling_mode === "flexible"
                            ? `About ${confirmedBooking.service_duration_minutes} min`
                            : `${confirmedBooking.service_duration_minutes} min`
                          : service
                            ? serviceDurationLabel(service)
                            : "—";
                    const depositPaid =
                      confirmedBooking?.service_deposit ?? service?.deposit ?? 0;
                    const price = confirmedBooking?.service_price ?? service?.price ?? 0;
                    const rows = [
                      {
                        label: "Name",
                        value:
                          confirmedBooking?.client_name ||
                          `${form.firstName} ${form.lastName}`.trim() ||
                          "—",
                      },
                      ...(confirmedBooking?.listing_name || selectedListing?.name
                        ? [{ label: "Listing", value: confirmedBooking?.listing_name || selectedListing?.name || "—" }]
                        : []),
                      { label: "Format", value: confFormat === "online" ? "Online" : "In person" },
                      ...(confHost ? [{ label: "You'll meet", value: confHost }] : []),
                      ...(confLocation ? [{ label: "Location", value: confLocation }] : []),
                      { label: "Date", value: confDate },
                      ...(confTime ? [{ label: "Time", value: confTime }] : []),
                      { label: "Duration", value: confDuration },
                      ...(depositPaid > 0
                        ? [
                            { label: "Deposit paid", value: `₦${depositPaid}` },
                            {
                              label: "Balance due",
                              value: `₦${Math.max(0, price - depositPaid)} at appointment`,
                            },
                          ]
                        : [{ label: "Amount paid", value: `₦${price}` }]),
                      ...(confirmedBooking?.payment_reference
                        ? [{ label: "Payment ref", value: confirmedBooking.payment_reference }]
                        : []),
                      { label: "Paid to", value: confirmedBooking?.business_name || businessProfile.name },
                    ];
                    return rows.map(({ label, value }) => (
                      <div
                        key={label}
                        style={{ display: "flex", justifyContent: "space-between", fontSize: 13, textAlign: "left" }}
                      >
                        <span style={{ color: stone500 }}>{label}</span>
                        <span style={{ fontWeight: 500, color: dark }}>{value}</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* Calendar + receipt actions */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 400 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <button
                    type="button"
                    disabled={!confirmedBooking?.id || receiptBusy === "download"}
                    onClick={handleDownloadReceipt}
                    style={{
                      padding: "12px 10px",
                      borderRadius: 12,
                      border: "1px solid var(--color-border)",
                      backgroundColor: "var(--color-card)",
                      fontSize: 12,
                      fontWeight: 600,
                      color: brandPrimary,
                      cursor: confirmedBooking?.id ? "pointer" : "not-allowed",
                      opacity: confirmedBooking?.id ? 1 : 0.55,
                      fontFamily: "'DM Sans', sans-serif",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    {receiptBusy === "download" ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                    Download receipt
                  </button>
                  <button
                    type="button"
                    disabled={!confirmedBooking?.id || receiptBusy === "email"}
                    onClick={handleEmailReceipt}
                    style={{
                      padding: "12px 10px",
                      borderRadius: 12,
                      border: "1px solid var(--color-border)",
                      backgroundColor: "var(--color-card)",
                      fontSize: 12,
                      fontWeight: 600,
                      color: brandPrimary,
                      cursor: confirmedBooking?.id ? "pointer" : "not-allowed",
                      opacity: confirmedBooking?.id ? 1 : 0.55,
                      fontFamily: "'DM Sans', sans-serif",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    {receiptBusy === "email" ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
                    Email receipt
                  </button>
                </div>
                {receiptMessage && (
                  <p style={{ fontSize: 12, color: stone500, lineHeight: 1.5, margin: 0 }}>{receiptMessage}</p>
                )}

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

              <p style={{ marginTop: 28, fontSize: 12, color: stone400, maxWidth: 420, lineHeight: 1.6 }}>
                Need to cancel or reschedule? Email{" "}
                <a
                  href={`mailto:${businessProfile.contact_email || businessProfile.help_email || ""}`}
                  style={{ color: brandPrimary }}
                >
                  {businessProfile.contact_email || "the business"}
                </a>
                {businessProfile.help_email &&
                  businessProfile.help_email !== businessProfile.contact_email && (
                    <>
                      {" "}
                      or help at{" "}
                      <a href={`mailto:${businessProfile.help_email}`} style={{ color: brandPrimary }}>
                        {businessProfile.help_email}
                      </a>
                    </>
                  )}
                .
              </p>
                </>
              )}
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
                  <p style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{businessProfile.name}</p>
                  <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 11 }}>Booking assistant</p>
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
                {aiBusy && activitySteps.length > 0 && (
                  <div style={{ display: "flex", justifyContent: "flex-start" }}>
                    <div
                      style={{
                        marginLeft: 30,
                        padding: "10px 12px",
                        fontSize: 11,
                        lineHeight: 1.5,
                        backgroundColor: creamCard,
                        color: "var(--color-muted-foreground)",
                        borderRadius: "12px",
                        border: "1px solid var(--color-border)",
                        maxWidth: "85%",
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>Working…</div>
                      {activitySteps.map((step) => (
                        <div key={step.id} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                          {step.status === "running" ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Check size={12} color={brandAccent} />
                          )}
                          <span>{step.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {aiBusy && activitySteps.length === 0 && (
                  <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "center", gap: 6 }}>
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
                      }}
                    >
                      <Sparkles size={11} color={brandAccent} />
                    </div>
                    <div
                      style={{
                        padding: "9px 12px",
                        fontSize: 12,
                        backgroundColor: creamCard,
                        color: "var(--color-muted-foreground)",
                        borderRadius: "14px 14px 14px 4px",
                      }}
                    >
                      Thinking…
                    </div>
                  </div>
                )}
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
                  onKeyDown={(e) => e.key === "Enter" && !aiBusy && sendMessage()}
                  placeholder={aiBusy ? "Waiting for reply…" : voiceActive ? "Listening… or type here" : "Ask me anything…"}
                  disabled={aiBusy}
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
                    opacity: aiBusy ? 0.7 : 1,
                  }}
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={aiBusy}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    border: "none",
                    backgroundColor: brandPrimary,
                    cursor: aiBusy ? "default" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    transition: "background-color 0.15s",
                    opacity: aiBusy ? 0.6 : 1,
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
