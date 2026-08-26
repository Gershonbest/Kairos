// Marketing homepage for Orheo.

import { useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import {
  Calendar,
  Users,
  ArrowRight,
  Star,
  Smartphone,
  Brain,
  CreditCard,
  BarChart3,
} from "lucide-react";
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
import { MarketingChrome } from "./MarketingChrome";
import { usePageMeta } from "../../components/marketing/usePageMeta";
import { DEFAULT_DESCRIPTION } from "../../../lib/seo";

const features = [
  {
    icon: Calendar,
    title: "Smart Booking Calendar",
    description:
      "Intuitive scheduling with real-time availability. Sync with Google, Apple, and Outlook calendars.",
    color: "#00D19A",
    image: featureCalendar,
  },
  {
    icon: Brain,
    title: "Orion",
    description:
      "Orion handles customer inquiries, suggests optimal scheduling, and surfaces business insights automatically.",
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
    title: "Notifications & Reminders",
    description:
      "Send SMS and email notifications to your clients and team members. Set reminders for upcoming bookings and appointments.",
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
      "Orion cut our no-shows by 60% and doubled our online bookings in the first month. It answers questions even when we're closed!",
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

const inViewProps = {
  once: true,
  amount: 0.05,
} as const;

export function LandingPage() {
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  usePageMeta({
    title: "Smart Bookings for Service Businesses",
    description: DEFAULT_DESCRIPTION,
    path: "/",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Orheo",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: DEFAULT_DESCRIPTION,
      url: "https://www.orheo.com/",
    },
  });
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
    if (window.location.hash === "#pricing") {
      navigate("/pricing", { replace: true });
    }
  }, [navigate]);

  return (
    <MarketingChrome>
      <motion.div
        className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-accent z-[60] origin-left"
        style={{ scaleX: progressScaleX }}
      />

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
              No credit card required · 7-day free trial ·{" "}
              <Link to="/pricing" className="text-white underline underline-offset-2">
                See pricing
              </Link>
              {" · "}
              <Link to="/faq" className="text-white underline underline-offset-2">
                FAQ
              </Link>
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
                viewport={inViewProps}
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
      <section id="features" className="scroll-mt-24 py-16 md:py-24 bg-gradient-to-b from-white to-gray-50">
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
                viewport={inViewProps}
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
                viewport={inViewProps}
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

      {/* Testimonials Section */}
      <section id="testimonials" className="scroll-mt-24 py-16 md:py-24 bg-white">
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
                viewport={inViewProps}
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
            viewport={inViewProps}
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Ready to transform your booking experience?
            </h2>
            <p className="text-xl text-white/85 mb-10">
              Join thousands of African businesses already growing with Orheo. Start your free trial today.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/signup"
                className="px-8 py-4 bg-white text-primary text-lg font-semibold rounded-xl hover:bg-gray-50 transition-all hover:scale-105 flex items-center gap-2 shadow-xl"
              >
                Start Your 7-Day Free Trial
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                to="/pricing"
                className="px-8 py-4 bg-black/15 text-white text-lg font-semibold rounded-xl hover:bg-black/25 transition-all border-2 border-white/20"
              >
                View Pricing
              </Link>
            </div>
            <p className="text-white/75 mt-6 text-sm">
              ✨ No credit card required ·{" "}
              <Link to="/faq" className="underline underline-offset-2 text-white">
                Read the FAQ
              </Link>
              {" · "}
              <Link to="/privacy" className="underline underline-offset-2 text-white">
                Privacy
              </Link>
            </p>
          </motion.div>
        </div>
      </section>
    </MarketingChrome>
  );
}