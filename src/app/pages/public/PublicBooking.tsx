// Public multi-step booking flow for clients.

import React, { useState, useRef, useEffect, useMemo } from "react";
import { useParams, useSearchParams, useLocation } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import {
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
import { resolveMediaUrl } from "../../../lib/media";
import { PhoneInput } from "../../components/forms/PhoneInput";
import { BrandLoader } from "../../components/brand/BrandLoader";
import { googleMapsSearchUrl } from "../../../lib/data/locations";
import { BookingSummary } from "../../components/public-booking/BookingSummary";
import { MonogramThumb } from "../../components/public-booking/MonogramThumb";
import { ServiceRow } from "../../components/public-booking/ServiceRow";
import { StepTrail } from "../../components/public-booking/StepTrail";
import { useForceLightTheme } from "../../components/theme/ThemeProvider";
import { usePageMeta } from "../../components/marketing/usePageMeta";

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
  staff?: Array<{ id: string; full_name: string; job_title?: string | null; is_bookable?: boolean }>;
}

interface ListingOption {
  id: string;
  name: string;
  description?: string;
  status: "available" | "reserved" | "sold" | "hidden";
  image_urls: string[];
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

type StepId = "service" | "listing" | "staff" | "datetime" | "details" | "payment" | "confirmation";

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
const STAFF_STEP_LABELS = ["Service", "Who you'll see", "Date & Time", "Your Details", "Payment"];
const LISTING_STEP_LABELS = ["Service", "Product", "Date & Time", "Your Details", "Payment"];
const LISTING_STAFF_STEP_LABELS = ["Service", "Product", "Who you'll see", "Date & Time", "Your Details", "Payment"];
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function localPhoneFromStored(stored: string | null | undefined, dialCode: string): string {
  if (!stored) return "";
  const digits = stored.replace(/\s+/g, "");
  if (dialCode && digits.startsWith(dialCode)) return digits.slice(dialCode.length);
  return stored;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PublicBooking() {
  useForceLightTheme();
  const { pathname } = useLocation();
  usePageMeta({
    title: "Book an appointment",
    description: "Schedule a service appointment online.",
    path: pathname,
    noindex: true,
  });
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
  const [selectedStaffId, setSelectedStaffId] = useState<string | "anyone">("anyone");
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
  const bookableStaff = (service?.staff ?? []).filter((person) => person.is_bookable !== false);
  const usesStaffPicker = bookableStaff.length >= 2;
  const assignedQueryId =
    selectedStaffId !== "anyone"
      ? selectedStaffId
      : bookableStaff.length === 1
        ? bookableStaff[0].id
        : undefined;
  const stepOrder: StepId[] = [
    "service",
    ...(usesListingFlow ? (["listing"] as StepId[]) : []),
    ...(usesStaffPicker ? (["staff"] as StepId[]) : []),
    "datetime",
    "details",
    "payment",
    "confirmation",
  ];
  const stepLabels = usesListingFlow
    ? usesStaffPicker
      ? LISTING_STAFF_STEP_LABELS
      : LISTING_STEP_LABELS
    : usesStaffPicker
      ? STAFF_STEP_LABELS
      : BASE_STEP_LABELS;
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
            staff: row.staff ?? [],
            image: row.image_url || "",
          }));
          setServices(mapped);
          if (preselectedServiceId) {
            const selected = mapped.find((s) => s.id === preselectedServiceId);
            if (selected) {
              setService(selected);
              setSelectedListing(null);
              setStep(
                selected.booking_type === "listing"
                  ? "listing"
                  : (selected.staff?.length ?? 0) >= 2
                    ? "staff"
                    : "datetime"
              );
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
        service.booking_type === "listing" ? selectedListing?.id : undefined,
        assignedQueryId
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
  }, [businessId, service, selectedDate, selectedListing, assignedQueryId]);

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
        ...(assignedQueryId ? { assigned_user_id: assignedQueryId } : {}),
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

  const selectedPerson =
    selectedStaffId !== "anyone"
      ? bookableStaff.find((person) => person.id === selectedStaffId)
      : bookableStaff.length === 1
        ? bookableStaff[0]
        : undefined;
  const hostLabel = selectedPerson
    ? formatHostLabel(selectedPerson.full_name, selectedPerson.job_title)
    : usesStaffPicker && selectedStaffId === "anyone"
      ? "Anyone available"
      : service
        ? formatHostLabel(service.host_name, service.host_title)
        : null;

  const dateLabel = selectedDateObj
    ? `${selectedDateObj.day}, ${selectedDateObj.month} ${selectedDateObj.num}`
    : null;
  const timeLabel =
    selectedSlotIso && service?.scheduling_mode !== "all_day" ? displayTime(selectedSlotIso) : null;
  const dueTodayAmount = service ? (service.deposit > 0 ? service.deposit : service.price) : null;
  const contactName =
    form.firstName.trim() || form.lastName.trim()
      ? `${form.firstName} ${form.lastName}`.trim()
      : null;
  const showSummaryRail = step !== "confirmation";
  const showMobileStrip = Boolean(service) && step !== "confirmation";

  const summaryProps = {
    businessName: businessProfile.name,
    serviceName: service?.name,
    serviceImage: service?.image || null,
    listingName: selectedListing?.name,
    dateLabel,
    timeLabel: service?.scheduling_mode === "all_day" && selectedSlotIso ? "All day" : timeLabel,
    durationLabel: service ? serviceDurationLabel(service) : null,
    formatLabel: resolvedAppointmentFormat
      ? resolvedAppointmentFormat === "online"
        ? "Online"
        : "In person"
      : null,
    hostLabel,
    contactName,
    totalLabel: service ? `₦${service.price}` : null,
    dueTodayLabel: dueTodayAmount != null ? `₦${dueTodayAmount}` : null,
    balanceLabel:
      service && service.deposit > 0 ? `₦${Math.max(0, service.price - service.deposit)}` : null,
  };

  return (
    <div className={`booking-page ${showMobileStrip ? "pb-28 lg:pb-0" : ""}`}>
      <div className="mx-auto max-w-5xl px-5 pb-16 pt-10 sm:px-8">
        {/* Hero */}
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="mb-4 flex items-center gap-3">
              {businessProfile.public_logo_url ? (
                <img
                  src={resolveMediaUrl(businessProfile.public_logo_url)}
                  alt=""
                  className="h-10 w-10 rounded-xl object-cover ring-1 ring-border"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-emerald-300">
                  <Sparkles size={16} />
                </div>
              )}
              <span className="text-xs font-medium text-muted-foreground">Accepting bookings</span>
            </div>
            <h1 className="booking-hero-name">{businessProfile.name}</h1>
            {businessProfile.public_tagline && (
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                {businessProfile.public_tagline}
              </p>
            )}
          </div>
        </header>

        {step !== "confirmation" && (
          <StepTrail labels={stepLabels} activeIndex={Math.max(0, stepIndex)} />
        )}

        <div
          className={`mt-10 grid gap-10 ${
            showSummaryRail ? "lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start" : ""
          }`}
        >
          <div className="min-w-0">
            <AnimatePresence mode="wait">
              {/* Service */}
              {step === "service" && (
                <motion.div
                  key="service"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                >
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground">Choose a service</h2>
                  {businessProfile.public_description && (
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                      {businessProfile.public_description}
                    </p>
                  )}

                  <div className="mt-7 flex flex-col gap-3">
                    {servicesLoading && <BrandLoader label="Loading services" />}
                    {!servicesLoading && servicesError && (
                      <p className="text-sm text-destructive">{servicesError}</p>
                    )}
                    {!servicesLoading && !servicesError && services.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No active services are available for this business yet.
                      </p>
                    )}
                    {services.map((svc) => (
                      <ServiceRow
                        key={svc.id}
                        name={svc.name}
                        description={svc.description}
                        meta={
                          [
                            formatHostLabel(svc.host_name, svc.host_title)
                              ? `With ${formatHostLabel(svc.host_name, svc.host_title)}`
                              : null,
                            appointmentTypeLabels[svc.appointment_type],
                          ]
                            .filter(Boolean)
                            .join(" · ") || undefined
                        }
                        durationLabel={serviceDurationLabel(svc)}
                        priceLabel={`₦${svc.price}`}
                        depositLabel={svc.deposit > 0 ? `₦${svc.deposit} deposit` : undefined}
                        imageUrl={svc.image || null}
                        onClick={() => {
                          setService(svc);
                          setAppointmentFormat("");
                          setSelectedListing(null);
                          setSelectedStaffId("anyone");
                          setSelectedDate("");
                          setSelectedSlotIso("");
                          setStep(
                            svc.booking_type === "listing"
                              ? "listing"
                              : (svc.staff?.length ?? 0) >= 2
                                ? "staff"
                                : "datetime"
                          );
                        }}
                      />
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Listing */}
              {step === "listing" && service && service.booking_type === "listing" && (
                <motion.div
                  key="listing"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                >
                  <button type="button" className="booking-btn-ghost" onClick={() => setStep("service")}>
                    <ArrowLeft size={15} /> Back to services
                  </button>
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground">Select a product</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Choose the exact property, vehicle, or item for {service.name}.
                  </p>

                  <div className="mt-7 flex flex-col gap-3">
                    {listingsLoading && <BrandLoader label="Loading products" />}
                    {!listingsLoading && serviceListings.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No available products for this service right now.
                      </p>
                    )}
                    {serviceListings.map((listing) => (
                      <ServiceRow
                        key={listing.id}
                        name={listing.name}
                        description={listing.description}
                        imageUrl={listing.image_urls[0] || null}
                        selected={selectedListing?.id === listing.id}
                        onClick={() => {
                          setSelectedListing(listing);
                          setSelectedDate("");
                          setSelectedSlotIso("");
                        }}
                      />
                    ))}
                  </div>

                  {selectedListing && (
                    <motion.button
                      type="button"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="booking-btn-primary mt-6"
                      onClick={() => setStep(usesStaffPicker ? "staff" : "datetime")}
                    >
                      {usesStaffPicker ? "Continue to who you'll see" : "Continue to date & time"}
                    </motion.button>
                  )}
                </motion.div>
              )}

              {step === "staff" && service && (
                <motion.div
                  key="staff"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  className="booking-panel"
                >
                  <button
                    type="button"
                    className="booking-btn-ghost mb-4"
                    onClick={() => setStep(usesListingFlow ? "listing" : "service")}
                  >
                    <ArrowLeft size={15} /> Back
                  </button>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Who you'll see</p>
                  <h2 className="mt-2 font-display text-2xl font-semibold">Choose someone</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Pick a person, or choose Anyone and we’ll match the first available staff member.
                  </p>
                  <div className="mt-6 space-y-2">
                    <button
                      type="button"
                      onClick={() => setSelectedStaffId("anyone")}
                      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${
                        selectedStaffId === "anyone"
                          ? "border-primary bg-primary/5"
                          : "border-border bg-card hover:border-foreground/20"
                      }`}
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
                        ?
                      </span>
                      <div>
                        <p className="text-sm font-semibold">Anyone</p>
                        <p className="text-xs text-muted-foreground">First available at your chosen time</p>
                      </div>
                    </button>
                    {bookableStaff.map((person) => {
                      const initials = person.full_name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase();
                      return (
                        <button
                          key={person.id}
                          type="button"
                          onClick={() => setSelectedStaffId(person.id)}
                          className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${
                            selectedStaffId === person.id
                              ? "border-primary bg-primary/5"
                              : "border-border bg-card hover:border-foreground/20"
                          }`}
                        >
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                            {initials}
                          </span>
                          <div>
                            <p className="text-sm font-semibold">{person.full_name}</p>
                            {person.job_title ? (
                              <p className="text-xs text-muted-foreground">{person.job_title}</p>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <motion.button
                    type="button"
                    className="booking-btn-primary mt-6"
                    onClick={() => setStep("datetime")}
                  >
                    Continue to date & time
                  </motion.button>
                </motion.div>
              )}

              {/* Date & time */}
              {step === "datetime" && service && (
                <motion.div
                  key="datetime"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                >
                  <button
                    type="button"
                    className="booking-btn-ghost"
                    onClick={() =>
                      setStep(usesStaffPicker ? "staff" : usesListingFlow ? "listing" : "service")
                    }
                  >
                    <ArrowLeft size={15} /> Back
                  </button>
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground">Pick a date & time</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {service.name}
                    {selectedListing ? ` · ${selectedListing.name}` : ""}
                    {hostLabel ? ` · ${hostLabel}` : ""}
                  </p>

                  <div className="booking-panel mt-7">
                    <div className="mb-4 flex items-center justify-between">
                      <span className="text-sm font-semibold text-foreground">
                        {(visibleDates[0]
                          ? new Date(`${visibleDates[0].key}T00:00:00`)
                          : new Date()
                        ).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                      </span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card disabled:opacity-30"
                          disabled={dateOffset === 0}
                          onClick={() => setDateOffset(Math.max(0, dateOffset - 7))}
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <button
                          type="button"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card disabled:opacity-30"
                          disabled={dateOffset >= Math.max(0, allDates.length - 7)}
                          onClick={() =>
                            setDateOffset((prev) => Math.min(Math.max(0, allDates.length - 7), prev + 7))
                          }
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-7 gap-1.5">
                      {visibleDates.map((d) => (
                        <button
                          key={d.key}
                          type="button"
                          className="booking-date"
                          data-selected={selectedDate === d.key}
                          disabled={!d.available}
                          onClick={() => {
                            setSelectedDate(d.key);
                            setSelectedSlotIso("");
                          }}
                        >
                          <span className="text-[11px] opacity-70">{d.day}</span>
                          <span className="text-sm font-semibold">{d.num}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <AnimatePresence>
                    {selectedDate && service.scheduling_mode === "all_day" && (
                      <motion.div
                        key="allday"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="booking-panel mt-3 overflow-hidden"
                      >
                        <p className="mb-2 text-sm font-semibold text-foreground">{dateLabel}</p>
                        {slotsLoading ? (
                          <BrandLoader label="Checking availability" size="sm" />
                        ) : selectedSlotIso ? (
                          <p className="text-sm text-muted-foreground">
                            This books the entire calendar day — no start time needed.
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">
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
                        className="booking-panel mt-3 overflow-hidden"
                      >
                        <p className="mb-1 text-sm font-semibold text-foreground">
                          Available times for {dateLabel}
                        </p>
                        {service.scheduling_mode === "flexible" && (
                          <p className="mb-4 text-xs text-muted-foreground">
                            Pick a start time. Typical length: about {service.duration} minutes.
                          </p>
                        )}
                        {service.scheduling_mode !== "flexible" && <div className="mb-4" />}
                        {Object.entries(groupedSlots).map(([label, slots]) => (
                          <div key={label} className="mb-4 last:mb-0">
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                              {label}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {slots.map((slotIso) => (
                                <button
                                  key={slotIso}
                                  type="button"
                                  className="booking-slot"
                                  data-selected={selectedSlotIso === slotIso}
                                  onClick={() => setSelectedSlotIso(slotIso)}
                                >
                                  {displayTime(slotIso)}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                        {slotsLoading && <BrandLoader label="Loading times" size="sm" />}
                        {!slotsLoading && Object.keys(groupedSlots).length === 0 && (
                          <p className="text-sm text-muted-foreground">
                            No available slots for this date. Please pick another day.
                          </p>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {service.appointment_type === "hybrid" && selectedSlotIso && (
                    <div className="booking-panel mt-4">
                      <p className="mb-3 text-sm font-semibold text-foreground">How would you like to attend?</p>
                      <div className="grid grid-cols-2 gap-2">
                        {(["online", "onsite"] as AppointmentFormat[]).map((format) => {
                          const selected = appointmentFormat === format;
                          return (
                            <button
                              key={format}
                              type="button"
                              onClick={() => setAppointmentFormat(format)}
                              className={`rounded-xl border p-3 text-left transition-colors ${
                                selected
                                  ? "border-primary bg-primary/5"
                                  : "border-border bg-card hover:border-foreground/20"
                              }`}
                            >
                              <p className="text-sm font-semibold text-foreground">
                                {format === "online" ? "Online" : "In person"}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {format === "online"
                                  ? "Video call link sent after booking"
                                  : <>
                                      {resolvePublicLocation(service, businessProfile.location, format) || "At the business location"}
                                      {businessProfile.location && (
                                        <a
                                          href={googleMapsSearchUrl(businessProfile.location)}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="ml-2 underline text-primary"
                                        >
                                          Get Directions
                                        </a>
                                      )}
                                    </>}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <AnimatePresence>
                    {selectedDate &&
                      selectedSlotIso &&
                      (service.appointment_type !== "hybrid" || appointmentFormat) && (
                        <motion.button
                          type="button"
                          key="continue-dt"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="booking-btn-primary mt-5"
                          onClick={() => setStep("details")}
                        >
                          Continue to your details
                        </motion.button>
                      )}
                  </AnimatePresence>
                </motion.div>
              )}

              {/* Details */}
              {step === "details" && service && (
                <motion.div
                  key="details"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                >
                  <button type="button" className="booking-btn-ghost" onClick={() => setStep("datetime")}>
                    <ArrowLeft size={15} /> Back
                  </button>
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground">Your details</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    We use this to send your confirmation and calendar invite.
                  </p>

                  {service.client_instructions && (
                    <div className="mt-5 rounded-xl border border-border bg-slate-900/[0.03] px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                      <strong className="text-foreground">Before your visit:</strong>{" "}
                      {service.client_instructions}
                    </div>
                  )}

                  <div className="booking-panel mt-6 space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-foreground">Email address</label>
                      <div className="relative">
                        <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                          placeholder="alex@example.com"
                          autoComplete="email"
                          className="booking-field booking-field-icon"
                        />
                      </div>
                    </div>

                    {returningClient && (
                      <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm text-muted-foreground">
                        <Sparkles size={15} className="text-primary" />
                        <span>
                          Welcome back,{" "}
                          <strong className="text-foreground">
                            {`${returningClient.first_name} ${returningClient.last_name}`.trim()}
                          </strong>
                        </span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {(
                        [
                          { label: "First name", key: "firstName" as const, placeholder: "Alexandra", auto: "given-name" },
                          { label: "Surname", key: "lastName" as const, placeholder: "Chen", auto: "family-name" },
                        ] as const
                      ).map(({ label, key, placeholder, auto }) => (
                        <div key={key}>
                          <label className="mb-2 block text-sm font-semibold text-foreground">{label}</label>
                          <div className="relative">
                            <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <input
                              type="text"
                              value={form[key]}
                              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                              placeholder={placeholder}
                              autoComplete={auto}
                              className="booking-field booking-field-icon"
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
                      <label className="mb-2 block text-sm font-semibold text-foreground">
                        Anything we should know?{" "}
                        <span className="font-normal text-muted-foreground">(optional)</span>
                      </label>
                      <div className="relative">
                        <FileText size={15} className="absolute left-3 top-3 text-muted-foreground" />
                        <textarea
                          value={form.notes}
                          onChange={(e) => setForm({ ...form, notes: e.target.value })}
                          placeholder="Preferences, accessibility needs, or other notes…"
                          rows={3}
                          className="booking-field booking-field-icon resize-none"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      className="booking-btn-primary"
                      disabled={!canProceedDetails}
                      onClick={() => {
                        if (canProceedDetails) setStep("payment");
                      }}
                    >
                      Continue to payment
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Payment */}
              {step === "payment" && service && selectedSlotIso && (
                <motion.div
                  key="payment"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                >
                  <button type="button" className="booking-btn-ghost" onClick={() => setStep("details")}>
                    <ArrowLeft size={15} /> Back
                  </button>
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground">Secure your spot</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {service.deposit > 0
                      ? `Pay ₦${service.deposit} now to secure your spot. Remaining ₦${Math.max(0, service.price - service.deposit)} is due at your appointment.`
                      : `Pay ₦${service.price} securely via Paystack to confirm your booking.`}
                  </p>

                  <div className="mt-7 space-y-4">
                    <div className="booking-panel">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Due today
                      </p>
                      <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums text-foreground">
                        ₦{service.deposit > 0 ? service.deposit : service.price}
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Card, bank transfer, OPay, USSD, and more via Paystack
                      </p>
                      <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
                        <Lock size={12} className="mt-0.5 shrink-0" />
                        You’ll choose your method on the secure Paystack checkout. We never store card details.
                      </div>
                    </div>

                    <div className="booking-panel space-y-2.5 lg:hidden">
                      {[
                        { label: "Service", value: service.name },
                        ...(service.booking_type === "listing" && selectedListing
                          ? [{ label: "Listing", value: selectedListing.name }]
                          : []),
                        {
                          label: "Format",
                          value: resolvedAppointmentFormat === "online" ? "Online" : "In person",
                        },
                        ...(hostLabel ? [{ label: "You'll meet", value: hostLabel }] : []),
                        ...(appointmentLocation ? [{ label: "Location", value: appointmentLocation }] : []),
                        { label: "Date", value: dateLabel || "—" },
                        ...(service.scheduling_mode === "all_day"
                          ? []
                          : [{ label: "Time", value: displayTime(selectedSlotIso) }]),
                        { label: "Duration", value: serviceDurationLabel(service) },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex justify-between gap-3 text-sm">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="text-right font-medium text-foreground">{value}</span>
                        </div>
                      ))}
                      <div className="border-t border-border pt-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Due today</span>
                          <span className="font-semibold text-primary">
                            ₦{service.deposit > 0 ? service.deposit : service.price}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="booking-btn-primary"
                      disabled={isBooking}
                      onClick={handleDepositPayment}
                    >
                      {isBooking ? (
                        <>
                          <Loader2 size={15} className="animate-spin" />
                          Redirecting to Paystack…
                        </>
                      ) : (
                        <>
                          <Lock size={15} /> Continue to Paystack · ₦
                          {service.deposit > 0 ? service.deposit : service.price}
                        </>
                      )}
                    </button>
                    {bookingError && <p className="text-sm text-destructive">{bookingError}</p>}
                  </div>
                </motion.div>
              )}

              {/* Confirmation */}
              {step === "confirmation" && (
                <motion.div
                  key="confirmation"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.28 }}
                  className="mx-auto flex max-w-lg flex-col items-center text-center"
                >
                  {isBooking && !confirmedBooking && (
                    <>
                      <Loader2 size={36} className="mb-4 animate-spin text-primary" />
                      <p className="mb-2 text-sm text-muted-foreground">Confirming your payment…</p>
                      <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                        Please wait while we verify your payment and prepare your receipt.
                      </p>
                    </>
                  )}

                  {!isBooking && bookingError && !confirmedBooking && (
                    <>
                      <h2 className="mb-2 text-2xl font-semibold tracking-tight text-foreground">
                        {/not completed yet|still processing/i.test(bookingError)
                          ? "Payment still processing"
                          : "Payment unsuccessful"}
                      </h2>
                      <p className="mb-4 max-w-md text-sm leading-relaxed text-destructive">{bookingError}</p>
                      <p className="mb-5 max-w-md text-sm leading-relaxed text-muted-foreground">
                        {/not completed yet|still processing/i.test(bookingError)
                          ? "If you were charged, this page can take a moment to confirm. Refresh once, and do not pay again until you see a failure."
                          : "You were not charged for a completed booking. The time slot is free again — you can start over."}
                      </p>
                      <button
                        type="button"
                        className="booking-btn-primary max-w-xs"
                        onClick={() => {
                          if (/not completed yet|still processing/i.test(bookingError) && businessId) {
                            window.location.reload();
                            return;
                          }
                          resetBooking();
                        }}
                      >
                        {/not completed yet|still processing/i.test(bookingError)
                          ? "Refresh status"
                          : "Book again"}
                      </button>
                    </>
                  )}

                  {(confirmedBooking || (service && !isBooking && !bookingError)) && (
                    <>
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.1, type: "spring", stiffness: 220, damping: 18 }}
                        className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground"
                      >
                        <Check size={30} strokeWidth={2.5} />
                      </motion.div>
                      <h2 className="mb-2 text-3xl font-semibold tracking-tight text-foreground">
                        You&apos;re all set
                      </h2>
                      <p className="mb-8 max-w-md text-sm leading-relaxed text-muted-foreground">
                        A confirmation email with your receipt and calendar invite
                        {confirmedBooking?.payment_reference ? " (including payment reference)" : ""} has
                        been sent to{" "}
                        <strong className="text-foreground">
                          {confirmedBooking?.client_email || form.email}
                        </strong>
                        .
                      </p>

                      <div className="booking-panel mb-5 w-full text-left">
                        <div className="mb-4 flex items-center gap-3 border-b border-border pb-4">
                          <MonogramThumb
                            name={confirmedBooking?.service_name || service?.name || "Booking"}
                            imageUrl={
                              confirmedBooking?.service_image_url || service?.image || null
                            }
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground">
                              {confirmedBooking?.service_name || service?.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {confirmedBooking?.business_name || businessProfile.name}
                            </p>
                          </div>
                          <span className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                            Confirmed
                          </span>
                        </div>
                        <div className="space-y-2.5">
                          {(() => {
                            const confFormat =
                              confirmedBooking?.appointment_format ||
                              (resolvedAppointmentFormat === "online" ? "online" : "onsite");
                            const confHost =
                              formatHostLabel(
                                confirmedBooking?.assigned_name || confirmedBooking?.host_name,
                                confirmedBooking?.assigned_title || confirmedBooking?.host_title
                              ) || hostLabel;
                            const confLocation = confirmedBooking?.location || appointmentLocation;
                            const confStart = confirmedBooking?.start_at || selectedSlotIso;
                            const confDate = confStart
                              ? new Date(confStart).toLocaleDateString("en-US", {
                                  weekday: "short",
                                  month: "short",
                                  day: "numeric",
                                })
                              : dateLabel || "—";
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
                                ? [
                                    {
                                      label: "Listing",
                                      value:
                                        confirmedBooking?.listing_name || selectedListing?.name || "—",
                                    },
                                  ]
                                : []),
                              {
                                label: "Format",
                                value: confFormat === "online" ? "Online" : "In person",
                              },
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
                                ? [
                                    {
                                      label: "Payment ref",
                                      value: confirmedBooking.payment_reference,
                                    },
                                  ]
                                : []),
                              {
                                label: "Paid to",
                                value: confirmedBooking?.business_name || businessProfile.name,
                              },
                            ];
                            return rows.map(({ label, value }) => (
                              <div key={label} className="flex justify-between gap-3 text-sm">
                                <span className="text-muted-foreground">{label}</span>
                                <span className="text-right font-medium text-foreground">{value}</span>
                              </div>
                            ));
                          })()}
                        </div>
                      </div>

                      <div className="flex w-full flex-col gap-2.5">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={!confirmedBooking?.id || receiptBusy === "download"}
                            onClick={handleDownloadReceipt}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-3 text-xs font-semibold text-primary disabled:opacity-50"
                          >
                            {receiptBusy === "download" ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : (
                              <Download size={15} />
                            )}
                            Download receipt
                          </button>
                          <button
                            type="button"
                            disabled={!confirmedBooking?.id || receiptBusy === "email"}
                            onClick={handleEmailReceipt}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-3 text-xs font-semibold text-primary disabled:opacity-50"
                          >
                            {receiptBusy === "email" ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : (
                              <Mail size={15} />
                            )}
                            Email receipt
                          </button>
                        </div>
                        {receiptMessage && (
                          <p className="text-left text-xs text-muted-foreground">{receiptMessage}</p>
                        )}
                        <div className="grid grid-cols-3 gap-2">
                          {(
                            [
                              { label: "Google", kind: "google" as const },
                              { label: "Apple", kind: "ics" as const },
                              { label: "Outlook", kind: "ics" as const },
                            ] as const
                          ).map(({ label, kind }) => (
                            <button
                              key={label}
                              type="button"
                              disabled={!calendarLinks}
                              onClick={() => openCalendar(kind)}
                              className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card px-2 py-2.5 text-[11px] font-medium text-foreground disabled:opacity-50"
                            >
                              <CalendarPlus size={15} />
                              {label}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={resetBooking}
                          className="rounded-xl border border-border bg-card px-3 py-3 text-sm font-medium text-foreground hover:bg-slate-50"
                        >
                          Book another appointment
                        </button>
                      </div>

                      <p className="mt-7 max-w-md text-xs leading-relaxed text-muted-foreground">
                        Need to cancel or reschedule? Email{" "}
                        <a
                          href={`mailto:${businessProfile.contact_email || businessProfile.help_email || ""}`}
                          className="text-primary"
                        >
                          {businessProfile.contact_email || "the business"}
                        </a>
                        {businessProfile.help_email &&
                          businessProfile.help_email !== businessProfile.contact_email && (
                            <>
                              {" "}
                              or help at{" "}
                              <a href={`mailto:${businessProfile.help_email}`} className="text-primary">
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

          {showSummaryRail && (
            <aside className="hidden lg:block">
              <BookingSummary {...summaryProps} />
            </aside>
          )}
        </div>
      </div>

      {/* Mobile sticky context strip */}
      {showMobileStrip && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-4 py-3 backdrop-blur-md lg:hidden">
          <BookingSummary {...summaryProps} compact />
        </div>
      )}

      {/* AI Chat Widget */}
      <div className={`fixed right-5 z-50 ${showMobileStrip ? "bottom-20 lg:bottom-6" : "bottom-6"}`}>
        <AnimatePresence>
          {chatOpen && (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-16 right-0 flex h-[440px] w-[320px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            >
              <div className="flex shrink-0 items-center gap-2.5 bg-slate-900 px-4 py-3.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
                  <Sparkles size={15} className="text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-white">{businessProfile.name}</p>
                  <p className="text-[11px] text-white/65">Booking assistant</p>
                </div>
                <button
                  type="button"
                  onClick={() => setVoiceActive(!voiceActive)}
                  title={voiceActive ? "Disable voice" : "Enable voice"}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15"
                >
                  {voiceActive ? (
                    <Mic size={14} className="text-white" />
                  ) : (
                    <MicOff size={14} className="text-white/70" />
                  )}
                </button>
                <button type="button" onClick={() => setChatOpen(false)} className="p-0.5">
                  <X size={16} className="text-white/80" />
                </button>
              </div>

              {voiceActive && (
                <div className="flex shrink-0 items-center gap-2 bg-primary/10 px-3.5 py-2 text-[11px] text-primary">
                  Voice mode active — speak your request
                </div>
              )}

              <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3.5">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex items-end gap-1.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="mb-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100">
                        <Sparkles size={11} className="text-primary" />
                      </div>
                    )}
                    <div
                      className={`max-w-[78%] whitespace-pre-line px-3 py-2 text-xs leading-relaxed ${
                        msg.role === "user"
                          ? "rounded-[14px_14px_4px_14px] bg-primary text-primary-foreground"
                          : "rounded-[14px_14px_14px_4px] bg-slate-100 text-foreground"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {aiBusy && activitySteps.length > 0 && (
                  <div className="ml-7 max-w-[85%] rounded-xl border border-border bg-slate-50 px-3 py-2.5 text-[11px] text-muted-foreground">
                    <div className="mb-1.5 font-semibold">Working…</div>
                    {activitySteps.map((s) => (
                      <div key={s.id} className="mt-1 flex items-center gap-1.5">
                        {s.status === "running" ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Check size={12} className="text-primary" />
                        )}
                        <span>{s.label}</span>
                      </div>
                    ))}
                  </div>
                )}
                {aiBusy && activitySteps.length === 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100">
                      <Sparkles size={11} className="text-primary" />
                    </div>
                    <div className="rounded-[14px_14px_14px_4px] bg-slate-100 px-3 py-2 text-xs text-muted-foreground">
                      Thinking…
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {messages.length <= 2 && (
                <div className="flex shrink-0 flex-wrap gap-1.5 px-3 pb-2.5">
                  {["What are the prices?", "What's available this week?", "Help me book"].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => sendMessage(q)}
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-foreground"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex shrink-0 gap-2 border-t border-border px-3 py-2.5">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !aiBusy && sendMessage()}
                  placeholder={
                    aiBusy ? "Waiting for reply…" : voiceActive ? "Listening… or type here" : "Ask me anything…"
                  }
                  disabled={aiBusy}
                  className="min-w-0 flex-1 rounded-lg border-none bg-slate-100 px-3 py-2 text-xs text-foreground outline-none disabled:opacity-70"
                />
                <button
                  type="button"
                  onClick={() => sendMessage()}
                  disabled={aiBusy}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary disabled:opacity-60"
                >
                  <Send size={14} className="text-primary-foreground" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          type="button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setChatOpen(!chatOpen)}
          className={`relative flex h-14 w-14 items-center justify-center rounded-full border-none shadow-lg ${
            chatOpen ? "bg-slate-700" : "bg-primary"
          }`}
        >
          {chatOpen ? (
            <X size={20} className="text-white" />
          ) : (
            <MessageCircle size={20} className="text-white" />
          )}
          {!chatOpen && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-slate-900 text-[9px] font-bold text-white">
              AI
            </span>
          )}
        </motion.button>
      </div>
    </div>
  );
}
