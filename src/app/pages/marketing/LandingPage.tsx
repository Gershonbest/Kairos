// Marketing homepage for Kairos Bookings.

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { motion } from "motion/react";
import {
  Calendar,
  Sparkles,
  Users,
  TrendingUp,
  Shield,
  Zap,
  Clock,
  CreditCard,
  BarChart3,
  MessageSquare,
  CheckCircle2,
  ArrowRight,
  Star,
  Globe,
  Smartphone,
  Brain,
  Check,
  X,
} from "lucide-react";
import { api } from "../../../lib/api/client";

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
    color: "#3B3680",
  },
  {
    icon: Brain,
    title: "AI Assistant",
    description:
      "Let AI handle customer inquiries, suggest optimal scheduling, and provide business insights automatically.",
    color: "#3B3680",
  },
  {
    icon: CreditCard,
    title: "Integrated Payments",
    description:
      "Accept deposits and full payments online. Support for cards, bank transfers, and mobile money.",
    color: "#2ECC71",
  },
  {
    icon: Users,
    title: "Client Management",
    description:
      "Build rich customer profiles with booking history, preferences, and automated follow-ups.",
    color: "#3B3680",
  },
  {
    icon: BarChart3,
    title: "Business Analytics",
    description:
      "Track revenue, peak hours, popular services, and customer trends with beautiful dashboards.",
    color: "#2ECC71",
  },
  {
    icon: Smartphone,
    title: "Mobile-First Design",
    description:
      "Your clients book from any device. Your team manages from anywhere. Beautiful on every screen.",
    color: "#3B3680",
  },
];

const testimonials = [
  {
    name: "Amara Okafor",
    role: "Owner, Blissful Spa Lagos",
    image: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=100&h=100&fit=crop",
    quote:
      "Kairos cut our no-shows by 60% and doubled our online bookings in the first month. The AI assistant answers questions even when we're closed!",
    rating: 5,
  },
  {
    name: "Dr. Chidi Nwosu",
    role: "Wellness Clinic, Abuja",
    image: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=100&h=100&fit=crop",
    quote:
      "Finally, a booking system built for African businesses. The Naira pricing and mobile money support made it perfect for our patients.",
    rating: 5,
  },
  {
    name: "Fatima Hassan",
    role: "Founder, GlowUp Beauty Bar",
    image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=100&h=100&fit=crop",
    quote:
      "The analytics showed me which services to promote and when to staff up. Revenue is up 40% since we started using Kairos.",
    rating: 5,
  },
];

const stats = [
  { label: "Businesses Trust Us", value: "2,500+" },
  { label: "Bookings Processed", value: "1M+" },
  { label: "Average Revenue Increase", value: "35%" },
  { label: "Customer Satisfaction", value: "4.9/5" },
];

export function LandingPage() {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);

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
            ctaHref: plan.self_serve ? "/signup" : "mailto:support@kairosbookings.com",
          }))
        );
      })
      .catch(() => setPricingTiers([]))
      .finally(() => setPlansLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#3B3680] to-[#2ECC71] flex items-center justify-center">
                <Calendar className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900">
                Kairos Bookings
              </span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-gray-600 hover:text-purple-600 transition-colors">
                Features
              </a>
              <a href="#pricing" className="text-sm text-gray-600 hover:text-purple-600 transition-colors">
                Pricing
              </a>
              <a href="#testimonials" className="text-sm text-gray-600 hover:text-purple-600 transition-colors">
                Testimonials
              </a>
              <Link to="/login" className="text-sm text-gray-600 hover:text-purple-600 transition-colors">
                Sign In
              </Link>
              <Link
                to="/signup"
                className="px-5 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-xl hover:bg-purple-700 transition-colors"
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 bg-gradient-to-b from-purple-50 to-white">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-4xl mx-auto"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-full text-sm font-medium mb-8">
              <Sparkles className="w-4 h-4" />
              AI-Powered Booking System for African Businesses
            </div>
            <h1 className="text-5xl md:text-7xl font-bold text-gray-900 mb-6 leading-tight">
              Grow Your Service Business with{" "}
              <span className="bg-gradient-to-r from-purple-600 to-purple-800 bg-clip-text text-transparent">
                Smart Bookings
              </span>
            </h1>
            <p className="text-xl text-gray-600 mb-10 leading-relaxed max-w-3xl mx-auto">
              Transform how you manage appointments. Kairos automates scheduling, payments, and customer communication
              so you can focus on delivering exceptional service across Africa.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
              <Link
                to="/signup"
                className="px-8 py-4 bg-purple-600 text-white text-lg font-semibold rounded-xl hover:bg-purple-700 transition-all hover:scale-105 flex items-center gap-2 shadow-lg shadow-purple-200"
              >
                Start Your 7-Day Free Trial
                <ArrowRight className="w-5 h-5" />
              </Link>
              <a
                href="#demo"
                className="px-8 py-4 bg-white text-gray-700 text-lg font-semibold rounded-xl hover:bg-gray-50 transition-all border-2 border-gray-200"
              >
                Watch Demo
              </a>
            </div>
            <p className="text-sm text-gray-500">
              ✨ No credit card required · 7-day free trial · Cancel anytime
            </p>
          </motion.div>

          {/* Hero Image/Dashboard Preview */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="mt-16 relative"
          >
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border-8 border-white">
              <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/20 to-transparent z-10" />
              <img
                src="https://images.unsplash.com/photo-1551434678-e076c223a692?w=1200&h=700&fit=crop"
                alt="Kairos Dashboard"
                className="w-full"
              />
            </div>
            {/* Floating elements */}
            <div className="absolute -top-4 -left-4 w-24 h-24 bg-green-500 rounded-2xl opacity-20 blur-2xl" />
            <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-purple-500 rounded-2xl opacity-20 blur-2xl" />
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-white border-y border-gray-100">
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
              >
                <div className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-purple-800 bg-clip-text text-transparent mb-2">
                  {stat.value}
                </div>
                <div className="text-sm text-gray-600">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-gradient-to-b from-white to-gray-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Everything you need to run your{" "}
              <span className="bg-gradient-to-r from-purple-600 to-purple-800 bg-clip-text text-transparent">
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
                className="bg-white p-8 rounded-2xl border border-gray-100 hover:shadow-xl transition-all hover:scale-105"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-6"
                  style={{ backgroundColor: `${feature.color}15` }}
                >
                  <feature.icon className="w-6 h-6" style={{ color: feature.color }} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
                <p className="text-gray-600 leading-relaxed">{feature.description}</p>
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
              <span className="bg-gradient-to-r from-purple-600 to-purple-800 bg-clip-text text-transparent">
                minutes
              </span>
            </h2>
            <p className="text-xl text-gray-600">
              No technical skills needed. Our simple setup gets you accepting bookings in under 10 minutes.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connection line */}
            <div className="hidden md:block absolute top-24 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-200 via-purple-300 to-purple-200 -z-10" />

            {[
              {
                step: "1",
                title: "Create Your Account",
                description: "Sign up in 30 seconds. Add your business info and services.",
                icon: Users,
              },
              {
                step: "2",
                title: "Customize Your Booking Page",
                description: "Set your availability, prices, and branding. Share your unique link.",
                icon: Globe,
              },
              {
                step: "3",
                title: "Start Accepting Bookings",
                description: "Clients book online 24/7. Get paid automatically. Grow your business.",
                icon: TrendingUp,
              },
            ].map((item, index) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.2 }}
                className="relative"
              >
                <div className="bg-white p-8 rounded-2xl border-2 border-purple-100 text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-purple-700 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-purple-200">
                    <item.icon className="w-8 h-8 text-white" />
                  </div>
                  <div className="text-sm font-bold text-purple-600 mb-2">STEP {item.step}</div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{item.title}</h3>
                  <p className="text-gray-600">{item.description}</p>
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
              <span className="bg-gradient-to-r from-purple-600 to-purple-800 bg-clip-text text-transparent">
                pricing
              </span>
            </h2>
            <p className="text-xl text-gray-600 mb-8">
              Choose the perfect plan for your business. All plans include a 7-day free trial.
            </p>
          </div>

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
                className={`relative bg-white rounded-2xl border-2 p-8 ${
                  tier.highlighted
                    ? "border-purple-600 shadow-2xl shadow-purple-200 scale-105"
                    : "border-gray-200"
                }`}
              >
                {tier.highlighted && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-purple-600 to-purple-700 text-white text-sm font-semibold rounded-full">
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
                        ? "bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-200"
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
                        ? "bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-200"
                        : "bg-gray-100 text-gray-900 hover:bg-gray-200"
                    }`}
                  >
                    {tier.cta}
                  </a>
                )}

                <div className="space-y-3">
                  {tier.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
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
              <span className="bg-gradient-to-r from-purple-600 to-purple-800 bg-clip-text text-transparent">
                business owners
              </span>
            </h2>
            <p className="text-xl text-gray-600">
              Join thousands of service businesses across Africa growing with Kairos.
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
                className="bg-gradient-to-br from-purple-50 to-white p-8 rounded-2xl border border-purple-100"
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
      <section className="py-24 bg-gradient-to-br from-[#3B3680] via-[#4A4594] to-[#2E2A5C]">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Ready to transform your booking experience?
            </h2>
            <p className="text-xl text-purple-100 mb-10">
              Join 2,500+ African businesses already growing with Kairos. Start your free trial today.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/signup"
                className="px-8 py-4 bg-white text-purple-600 text-lg font-semibold rounded-xl hover:bg-gray-50 transition-all hover:scale-105 flex items-center gap-2 shadow-xl"
              >
                Start Your 7-Day Free Trial
                <ArrowRight className="w-5 h-5" />
              </Link>
              <a
                href="#pricing"
                className="px-8 py-4 bg-purple-700/50 text-white text-lg font-semibold rounded-xl hover:bg-purple-800/50 transition-all border-2 border-white/20"
              >
                View Pricing
              </a>
            </div>
            <p className="text-purple-200 mt-6 text-sm">
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
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#3B3680] to-[#2ECC71] flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-white" />
                </div>
                <span className="text-xl font-bold text-white">Kairos Bookings</span>
              </div>
              <p className="text-sm text-gray-400">
                AI-powered booking system built for African service businesses.
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
            <p className="text-sm text-gray-400">© 2026 Kairos Bookings. All rights reserved.</p>
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