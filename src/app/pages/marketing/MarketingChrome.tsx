// Shared marketing nav and footer for public pages.

import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { Menu, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import orheoLogo from "../../../assets/branding/logo.png";
import { SUPPORT_EMAIL } from "../../../lib/seo";
import { SocialShare } from "../../components/marketing/SocialShare";

const navLinkClass = "text-sm text-gray-600 hover:text-primary transition-colors duration-200";
const mobileLinkClass = "rounded-lg px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50";

function NavLink({
  to,
  active,
  children,
  onClick,
}: {
  to: string;
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`${navLinkClass} ${active ? "text-primary font-medium" : ""}`}
    >
      {children}
    </Link>
  );
}

export function MarketingChrome({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const onHome = pathname === "/";
  const featuresHref = onHome ? "#features" : "/#features";
  const close = () => setMobileMenuOpen(false);

  return (
    <div className="min-h-screen bg-white">
      <motion.nav
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="fixed top-0 left-0 right-0 z-50 bg-white/85 backdrop-blur-xl border-b border-gray-100"
      >
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2" aria-label="Orheo home">
              <motion.div
                className="flex items-center gap-2"
                whileHover={shouldReduceMotion ? undefined : { scale: 1.02 }}
                transition={{ type: "spring", stiffness: 300, damping: 22 }}
              >
                <img src={orheoLogo} alt="" className="h-10 w-auto rounded-lg bg-black p-1" />
                <span className="text-xl font-bold text-gray-900">Orheo</span>
              </motion.div>
            </Link>
            <div className="hidden md:flex items-center gap-8">
              <a href={featuresHref} className={navLinkClass}>
                Features
              </a>
              <NavLink to="/pricing" active={pathname === "/pricing"}>
                Pricing
              </NavLink>
              <NavLink to="/faq" active={pathname === "/faq"}>
                FAQ
              </NavLink>
              <Link to="/login" className={navLinkClass}>
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
            <button
              type="button"
              className="md:hidden inline-flex items-center justify-center rounded-xl p-2 text-gray-700 hover:bg-gray-100"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
          {mobileMenuOpen && (
            <div className="md:hidden flex flex-col gap-1 pb-2 pt-3 border-t border-gray-100 mt-3">
              <a href={featuresHref} className={mobileLinkClass} onClick={close}>
                Features
              </a>
              <Link to="/pricing" className={mobileLinkClass} onClick={close}>
                Pricing
              </Link>
              <Link to="/faq" className={mobileLinkClass} onClick={close}>
                FAQ
              </Link>
              <Link to="/login" className={mobileLinkClass} onClick={close}>
                Sign In
              </Link>
              <Link
                to="/signup"
                className="mt-1 px-4 py-2.5 bg-primary text-white text-sm font-medium rounded-xl text-center"
                onClick={close}
              >
                Start Free Trial
              </Link>
            </div>
          )}
        </div>
      </motion.nav>

      {children}

      <footer className="bg-gray-900 text-gray-300 py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div>
              <Link to="/" className="flex items-center gap-2 mb-4">
                <img src={orheoLogo} alt="" className="h-10 w-auto rounded-lg bg-black p-1" />
                <span className="text-xl font-bold text-white">Orheo</span>
              </Link>
              <p className="text-sm text-gray-400 mb-4">Create Order. Unlock Flow.</p>
              <SocialShare title="Orheo — smart bookings for service businesses" path="/" className="[&_button]:bg-gray-800 [&_a]:bg-gray-800 [&_a]:border-gray-700 [&_button]:border-gray-700 [&_span]:text-gray-400" />
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href={featuresHref} className="hover:text-white transition-colors">
                    Features
                  </a>
                </li>
                <li>
                  <Link to="/pricing" className="hover:text-white transition-colors">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link to="/faq" className="hover:text-white transition-colors">
                    FAQ
                  </Link>
                </li>
                <li>
                  <Link to="/signup" className="hover:text-white transition-colors">
                    Start free trial
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Company</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/" className="hover:text-white transition-colors">
                    Home
                  </Link>
                </li>
                <li>
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-white transition-colors">
                    Contact
                  </a>
                </li>
                <li>
                  <Link to="/privacy" className="hover:text-white transition-colors">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link to="/terms" className="hover:text-white transition-colors">
                    Terms of Service
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Get started</h4>
              <p className="text-sm text-gray-400 mb-4">
                7-day trial on Standard. No credit card. Paystack checkout when you are ready.
              </p>
              <Link
                to="/signup"
                className="inline-flex px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90"
              >
                Create your account
              </Link>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-gray-400">© 2026 Orheo. All rights reserved.</p>
            <div className="flex flex-wrap gap-6 text-sm">
              <Link to="/privacy" className="text-gray-400 hover:text-white transition-colors">
                Privacy
              </Link>
              <Link to="/terms" className="text-gray-400 hover:text-white transition-colors">
                Terms
              </Link>
              <Link to="/faq" className="text-gray-400 hover:text-white transition-colors">
                FAQ
              </Link>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-gray-400 hover:text-white transition-colors">
                {SUPPORT_EMAIL}
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
