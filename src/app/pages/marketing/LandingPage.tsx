// Marketing homepage for Orheo.

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import {
  Calendar,
  Sparkles,
  Users,
  CheckCircle2,
  ArrowRight,
  Star,
  Smartphone,
  Brain,
  CreditCard,
  BarChart3,
} from "lucide-react";
import { api } from "../../../lib/api/client";
import orheoLogo from "../../../assets/branding/logo.png";
import heroBookingImage from "../../../assets/marketing/landing-hero-booking.jpg";
import featureCalendar from "../../../assets/marketing/feature-calendar.png";
import featureAi from "../../../assets/marketing/feature-ai.png";
import featurePayments from "../../../assets/marketing/feature-payments.png";
import featureClients from "../../../assets/marketing/feature-clients.png";
import featureAnalytics from "../../../assets/marketing/feature-analytics.png";
import featureMobile from "../../../assets/marketing/feature-mobile.png";
import stepCreateAccount from "../../../assets/marketing/step-create-account.png";
import stepCustomizeBooking from "../../../assets/marketing/step-customize-booking.png";
import stepAcceptBookings from "../../../assets/marketing/step-accept-bookings.png";
import testimonialNigeria from "../../../assets/marketing/testimonial-nigeria.jpg";
import testimonialGhana from "../../../assets/marketing/testimonial-ghana.jpg";
import testimonialKenya from "../../../assets/marketing/testimonial-kenya.jpg";

interface PricingTier {
  code: string;
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  highlighted?: boolean;
  cta: string;
  ctaHref: string;
}

function formatPrice(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

const features = [
  {
    icon: Calendar,
    title: "Smart Booking Calendar",
    description:
      "Drag-and-drop scheduling with real-time availability. Sync with Google, Apple, and Outlook calendars.",
    color: "#00D19A",
    image: featureCalendar,
  },
  {
    icon: Brain,
    title: "AI Assistant",
    description:
      "Let AI handle customer inquiries, suggest optimal scheduling, and provide business insights automatically.",
    color: "#3D5AFE",
    image: featureAi,
  },
  {
    icon: CreditCard,
    title: "Integrated Payments",
    description:
      "Accept deposits and full payments online. Support for cards, bank transfers, and mobile money.",
    color: "#00D19A",
    image: featurePayments,
  },
  {
    icon: Users,
    title: "Client Management",
    description:
      "Build rich customer profiles with booking history, preferences, and automated follow-ups.",
    color: "#3D5AFE",
    image: featureClients,
  },
  {
    icon: BarChart3,
    title: "Business Analytics",
    description:
      "Track revenue, peak hours, popular services, and customer trends with beautiful dashboards.",
    color: "#00D19A",
    image: featureAnalytics,
  },
  {
    icon: Smartphone,
    title: "Mobile-First Design",
    description:
      "Your clients book from any device. Your team manages from anywhere. Beautiful on every screen.",
    color: "#3D5AFE",
    image: featureMobile,
  },
];

const testimonials = [
  {
    name: "Amara Okafor",
    role: "Owner, Blissful Spa · Lagos, Nigeria",
    image: testimonialNigeria,
    quote:
      "Orheo cut our no-shows by 60% and doubled our online bookings in the first month. The AI assistant answers questions even when we're closed!",
    rating: 5,
  },
  {
    name: "Dr. Kwame Mensah",
    role: "Wellness Clinic · Accra, Ghana",
    image: testimonialGhana,
    quote:
      "Finally, a booking system built for African businesses. The local currency pricing and mobile money support made it perfect for our patients.",
    rating: 5,
  },
  {
    name: "Wanjiku Kamau",
    role: "Founder, GlowUp Beauty Bar · Nairobi, Kenya",
    image: testimonialKenya,
    quote:
      "The analytics showed me which services to promote and when to staff up. Revenue is up 40% since we started using Orheo.",
    rating: 5,
  },
];

const stats = [
  { label: "Businesses Trust Us", value: "2,500+" },
  { label: "Bookings Processed", value: "1M+" },
  { label: "Average Revenue Increase", value: "35%" },
  { label: "Customer Satisfaction", value: "4.9/5" },
];

const onboardingSteps = [
  {
    step: "1",
    title: "Create Your Account",
    description: "Sign up in 30 seconds. Add your business info and services.",
    image: stepCreateAccount,
  },
  {
    step: "2",
    title: "Customize Your Booking Page",
    description: "Set your availability, prices, and branding. Share your unique link.",
    image: stepCustomizeBooking,
  },
  {
    step: "3",
    title: "Start Accepting Bookings",
    description: "Clients book online 24/7. Get paid automatically. Grow your business.",
    image: stepAcceptBookings,
  },
];

export function LandingPage() {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const shouldReduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const progressScaleX = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 30,
    mass: 0.2,
  });
  const heroParallaxY = useTransform(
    scrollYProgress,
    [0, 0.3],
    [0, shouldReduceMotion ? 0 : -80]
  );
  const glowParallaxY = useTransform(
    scrollYProgress,
    [0, 0.35],
    [0, shouldReduceMotion ? 0 : 120]
  );

  useEffect(() => {
    api
      .listSubscriptionPlans()
      .then((plans) => {
        setPricingTiers(
          plans.map((plan) => ({
            code: plan.code,
            name: plan.name,
            price: formatPrice(plan.monthly_price),
            period: "/month",
            description: plan.description,
            features: plan.features,
            highlighted: plan.is_featured,
            cta: plan.self_serve ? "Start Free Trial" : "Contact Sales",
            ctaHref: plan.self_serve ? "/signup" : "mailto:support@orheobookings.com",
          }))
        );
      })
      .catch(() => setPricingTiers([]))
      .finally(() => setPlansLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <motion.div
        className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-accent z-[60] origin-left"
        style={{ scaleX: progressScaleX }}
      />
      {/* Navigation */}
      <motion.nav
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="fixed top-0 left-0 right-0 z-50 bg-white/85 backdrop-blur-xl border-b border-gray-100"
      >
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <motion.div
              className="flex items-center gap-2"
              whileHover={shouldReduceMotion ? undefined : { scale: 1.02 }}
              transition={{ type: "spring", stiffness: 300, damping: 22 }}
            >
              <img src={orheoLogo} alt="Orheo logo" className="h-10 w-auto rounded-lg bg-black p-1" />
              <span className="text-xl font-bold text-gray-900">
                Orheo
              </span>
            </motion.div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-gray-600 hover:text-primary transition-colors duration-200">
                Features
              </a>
              <a href="#pricing" className="text-sm text-gray-600 hover:text-primary transition-colors duration-200">
                Pricing
              </a>
              <a href="#testimonials" className="text-sm text-gray-600 hover:text-primary transition-colors duration-200">
                Testimonials
              </a>
              <Link to="/login" className="text-sm text-gray-600 hover:text-primary transition-colors duration-200">
                Sign In
              </Link>
              <motion.div whileHover={shouldReduceMotion ? undefined : { y: -1 }}>
                <Link
                to="/signup"
                className="px-5 py-2.5 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary/90 transition-colors"
              >
                Start Free Trial
              </Link>
              </motion.div>
            </div>
          </div>
        </div>
      </motion.nav>

      {/* Hero Section */}
      <section className="relative isolate overflow-hidden pt-32 pb-20 px-6 bg-[#050508]">
        {/* Atmosphere */}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(0,209,154,0.18),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(61,90,254,0.22),_transparent_50%)]" />
          <div className="absolute -top-24 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-[#00D19A]/20 blur-3xl" />
          <div className="absolute top-40 -left-24 h-72 w-72 rounded-full bg-[#3D5AFE]/25 blur-3xl" />
          <div className="absolute bottom-10 right-0 h-80 w-80 rounded-full bg-[#00D19A]/15 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
              maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
            }}
          />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white to-transparent" />
        </div>

        <div className="relative max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-4xl mx-auto"
          >
            <motion.div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mb-8 border border-white/15 bg-white/10 text-white backdrop-blur-sm"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              whileHover={shouldReduceMotion ? undefined : { y: -2 }}
            >
              <Sparkles className="w-4 h-4 text-[#00D19A]" />
              AI-Powered Booking System for African Businesses
            </motion.div>
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
              Grow Your Service Business with{" "}
              <span className="bg-gradient-to-r from-[#00D19A] to-[#3D5AFE] bg-clip-text text-transparent">
                Smart Bookings
              </span>
            </h1>
            <p className="text-xl text-white/70 mb-10 leading-relaxed max-w-3xl mx-auto">
              Transform how you manage appointments. Orheo automates scheduling, payments, and customer communication
              so you can focus on delivering exceptional service across Africa.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
              <motion.div whileHover={shouldReduceMotion ? undefined : { y: -3, scale: 1.015 }}>
                <Link
                to="/signup"
                className="px-8 py-4 bg-[#00D19A] text-black text-lg font-semibold rounded-xl hover:bg-[#00D19A]/90 transition-all hover:scale-105 flex items-center gap-2 shadow-lg shadow-[#00D19A]/25"
              >
                Start Your 7-Day Free Trial
                <ArrowRight className="w-5 h-5" />
              </Link>
              </motion.div>
              <a
                href="#demo"
                className="px-8 py-4 bg-white/10 text-white text-lg font-semibold rounded-xl hover:bg-white/15 transition-all border border-white/20 backdrop-blur-sm"
              >
                Watch Demo
              </a>
            </div>
            <p className="text-sm text-white/55">
              No credit card required · 7-day free trial · Cancel anytime
            </p>
          </motion.div>

          {/* Hero Image/Dashboard Preview */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            style={{ y: heroParallaxY }}
            className="mt-16 relative"
          >
            <motion.div
              className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/15"
              whileHover={shouldReduceMotion ? undefined : { scale: 1.01 }}
              transition={{ type: "spring", stiffness: 180, damping: 20 }}
              >
              <div className="absolute inset-0 bg-gradient-to-tr from-[#3D5AFE]/30 to-transparent z-10" />
              <img
                src={heroBookingImage}
                alt="Clients booking appointments at an African beauty and wellness business"
                className="w-full h-[280px] sm:h-[420px] md:h-[520px] object-cover"
              />
            </motion.div>
            <motion.div
              className="absolute -top-5 right-6 md:right-10 bg-[#0b0b10]/90 backdrop-blur border border-white/15 rounded-xl px-4 py-3 shadow-lg"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.45 }}
              whileHover={shouldReduceMotion ? undefined : { y: -4 }}
            >
              <p className="text-xs text-white/55">Weekly bookings</p>
              <p className="text-lg font-semibold text-[#00D19A]">+32%</p>
            </motion.div>
            <motion.div
              className="absolute -bottom-5 left-6 md:left-10 bg-[#0b0b10]/90 backdrop-blur border border-white/15 rounded-xl px-4 py-3 shadow-lg"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.65, duration: 0.45 }}
              whileHover={shouldReduceMotion ? undefined : { y: -4 }}
            >
              <p className="text-xs text-white/55">Revenue this month</p>
              <p className="text-lg font-semibold text-[#3D5AFE]">₦14,280,000</p>
            </motion.div>
            {/* Floating elements */}
            <motion.div
              className="absolute -top-4 -left-4 w-24 h-24 bg-[#00D19A] rounded-2xl opacity-20 blur-2xl"
              style={{ y: glowParallaxY }}
            />
            <motion.div
              className="absolute -bottom-4 -right-4 w-32 h-32 bg-[#3D5AFE] rounded-2xl opacity-20 blur-2xl"
              style={{ y: glowParallaxY }}
            />
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      {/* <section className="py-16 bg-white border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="text-center"
                whileHover={shouldReduceMotion ? undefined : { y: -4, scale: 1.02 }}
              >
                <div className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent mb-2">
                  {stat.value}
                </div>
                <div className="text-sm text-gray-600">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section> */}

      {/* Features Section */}
      <section id="features" className="py-24 bg-gradient-to-b from-white to-gray-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Everything you need to run your{" "}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                service business
              </span>
            </h2>
            <p className="text-xl text-gray-600">
              Built specifically for consultants, clinics, coaches, salons, and service professionals across Africa.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={shouldReduceMotion ? undefined : { y: -8, scale: 1.02 }}
                className="overflow-hidden rounded-2xl border border-gray-100 bg-white hover:shadow-xl transition-all"
              >
                <div className="relative h-44 overflow-hidden bg-black">
                  <motion.img
                    src={feature.image}
                    alt=""
                    className="h-full w-full object-cover"
                    whileHover={shouldReduceMotion ? undefined : { scale: 1.05 }}
                    transition={{ duration: 0.45 }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                  <motion.div
                    className="absolute bottom-4 left-4 w-12 h-12 rounded-xl flex items-center justify-center shadow-lg border border-white/10"
                    style={{ backgroundColor: feature.color }}
                    whileHover={shouldReduceMotion ? undefined : { rotate: 6, scale: 1.06 }}
                  >
                    <feature.icon className="w-6 h-6 text-white" strokeWidth={2.25} aria-hidden />
                  </motion.div>
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Get started in{" "}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                minutes
              </span>
            </h2>
            <p className="text-xl text-gray-600">
              No technical skills needed. Our simple setup gets you accepting bookings in under 10 minutes.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connection line */}
            <div className="hidden md:block absolute top-[7.5rem] left-[12%] right-[12%] h-0.5 bg-gradient-to-r from-[#00D19A]/30 via-[#3D5AFE]/50 to-[#00D19A]/30 -z-10" />

            {onboardingSteps.map((item, index) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.2 }}
                className="relative"
                whileHover={shouldReduceMotion ? undefined : { y: -6 }}
              >
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden text-center">
                  <div className="relative mx-auto mt-6 h-44 w-44 overflow-hidden rounded-full border-4 border-white shadow-md bg-[#F7FAF9]">
                    <motion.img
                      src={item.image}
                      alt=""
                      className="h-full w-full object-cover"
                      whileHover={shouldReduceMotion ? undefined : { scale: 1.05 }}
                      transition={{ duration: 0.45 }}
                    />
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-[#00D19A] to-[#3D5AFE] text-white text-xs font-bold tracking-wide shadow-md">
                      STEP {item.step}
                    </div>
                  </div>
                  <div className="p-6 pt-8">
                    <h3 className="text-xl font-bold text-gray-900 mb-3">{item.title}</h3>
                    <p className="text-gray-600">{item.description}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Simple, transparent{" "}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                pricing
              </span>
            </h2>
            <p className="text-xl text-gray-600 mb-8">
              Choose the perfect plan for your business. All plans include a 7-day free trial.
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-5xl mx-auto mb-10 rounded-2xl overflow-hidden border border-gray-200"
          >
            <div className="relative">
              <img
                src={featureAnalytics}
                alt="Analytics dashboard preview for Orheo growth plans"
                className="w-full h-56 md:h-64 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/20 to-transparent" />
              <div className="absolute left-6 md:left-8 bottom-6 text-white">
                <p className="text-xs uppercase tracking-[0.16em] text-white/85">Revenue-ready plans</p>
                <p className="text-xl md:text-2xl font-semibold mt-1">
                  Pick the plan that matches your current growth stage.
                </p>
              </div>
            </div>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {plansLoading && (
              <p className="md:col-span-3 text-center text-gray-500">Loading plans...</p>
            )}
            {!plansLoading && pricingTiers.length === 0 && (
              <p className="md:col-span-3 text-center text-gray-500">Pricing plans are currently unavailable.</p>
            )}
            {pricingTiers.map((tier, index) => (
              <motion.div
                key={tier.code}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={shouldReduceMotion ? undefined : { y: -8 }}
                className={`relative bg-white rounded-2xl border-2 p-8 ${
                  tier.highlighted
                    ? "border-primary shadow-2xl shadow-primary/20 scale-105"
                    : "border-gray-200"
                }`}
              >
                {tier.highlighted && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-primary to-accent text-white text-sm font-semibold rounded-full">
                    Most Popular
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">{tier.name}</h3>
                  <p className="text-gray-600 text-sm mb-4">{tier.description}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-bold text-gray-900">{tier.price}</span>
                    <span className="text-gray-500">{tier.period}</span>
                  </div>
                </div>

                {tier.ctaHref.startsWith("/") ? (
                  <Link
                    to={tier.ctaHref}
                    className={`block w-full py-3 px-6 rounded-xl font-semibold text-center mb-6 transition-all ${
                      tier.highlighted
                        ? "bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/20"
                        : "bg-gray-100 text-gray-900 hover:bg-gray-200"
                    }`}
                  >
                    {tier.cta}
                  </Link>
                ) : (
                  <a
                    href={tier.ctaHref}
                    className={`block w-full py-3 px-6 rounded-xl font-semibold text-center mb-6 transition-all ${
                      tier.highlighted
                        ? "bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/20"
                        : "bg-gray-100 text-gray-900 hover:bg-gray-200"
                    }`}
                  >
                    {tier.cta}
                  </a>
                )}

                <div className="space-y-3">
                  {tier.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-600">{feature}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>

          <p className="text-center text-gray-600 mt-12">
            All plans include 7-day free trial · No credit card required · Cancel anytime
          </p>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Loved by{" "}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                business owners
              </span>
            </h2>
            <p className="text-xl text-gray-600">
              Join thousands of service businesses across Africa growing with Orheo.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <motion.div
                key={testimonial.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={shouldReduceMotion ? undefined : { y: -6, scale: 1.01 }}
                className="bg-gradient-to-br from-primary/10 to-white p-8 rounded-2xl border border-primary/15"
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-gray-700 mb-6 leading-relaxed">&ldquo;{testimonial.quote}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <img
                    src={testimonial.image}
                    alt={testimonial.name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                  <div>
                    <div className="font-semibold text-gray-900">{testimonial.name}</div>
                    <div className="text-sm text-gray-600">{testimonial.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-br from-primary via-primary to-accent">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Ready to transform your booking experience?
            </h2>
            <p className="text-xl text-white/85 mb-10">
              Join 2,500+ African businesses already growing with Orheo. Start your free trial today.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/signup"
                className="px-8 py-4 bg-white text-primary text-lg font-semibold rounded-xl hover:bg-gray-50 transition-all hover:scale-105 flex items-center gap-2 shadow-xl"
              >
                Start Your 7-Day Free Trial
                <ArrowRight className="w-5 h-5" />
              </Link>
              <a
                href="#pricing"
                className="px-8 py-4 bg-black/15 text-white text-lg font-semibold rounded-xl hover:bg-black/25 transition-all border-2 border-white/20"
              >
                View Pricing
              </a>
            </div>
            <p className="text-white/75 mt-6 text-sm">
              ✨ No credit card required · 7-day free trial · Cancel anytime
            </p>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-300 py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <img src={orheoLogo} alt="Orheo logo" className="h-10 w-auto rounded-lg bg-black p-1" />
                <span className="text-xl font-bold text-white">Orheo</span>
              </div>
              <p className="text-sm text-gray-400">
                Create Order. Unlock Flow.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#features" className="hover:text-white transition-colors">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="hover:text-white transition-colors">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="#demo" className="hover:text-white transition-colors">
                    Demo
                  </a>
                </li>
                <li>
                  <Link to="/signup" className="hover:text-white transition-colors">
                    Sign Up
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Company</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#about" className="hover:text-white transition-colors">
                    About Us
                  </a>
                </li>
                <li>
                  <a href="#contact" className="hover:text-white transition-colors">
                    Contact
                  </a>
                </li>
                <li>
                  <a href="#careers" className="hover:text-white transition-colors">
                    Careers
                  </a>
                </li>
                <li>
                  <a href="#blog" className="hover:text-white transition-colors">
                    Blog
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Support</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#help" className="hover:text-white transition-colors">
                    Help Center
                  </a>
                </li>
                <li>
                  <a href="#docs" className="hover:text-white transition-colors">
                    Documentation
                  </a>
                </li>
                <li>
                  <a href="#privacy" className="hover:text-white transition-colors">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="#terms" className="hover:text-white transition-colors">
                    Terms of Service
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-gray-400">© 2026 Orheo. All rights reserved.</p>
            <div className="flex gap-6">
              <a href="#twitter" className="text-gray-400 hover:text-white transition-colors">
                Twitter
              </a>
              <a href="#linkedin" className="text-gray-400 hover:text-white transition-colors">
                LinkedIn
              </a>
              <a href="#instagram" className="text-gray-400 hover:text-white transition-colors">
                Instagram
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}