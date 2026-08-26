// Share the current marketing page on WhatsApp, X, LinkedIn, or by copying the link.

import { useState } from "react";
import { Check, Copy, Linkedin, Share2 } from "lucide-react";
import { shareUrl } from "../../../lib/seo";

type SocialShareProps = {
  title: string;
  path?: string;
  className?: string;
};

export function SocialShare({ title, path, className = "" }: SocialShareProps) {
  const [copied, setCopied] = useState(false);
  const url = shareUrl(path);
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(title);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const buttonClass =
    "inline-flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-primary/40 hover:text-primary transition-colors";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="inline-flex items-center gap-1.5 text-sm text-gray-500 mr-1">
        <Share2 className="h-4 w-4" />
        Share
      </span>
      <a
        className={buttonClass}
        href={`https://wa.me/?text=${encodedText}%20${encodedUrl}`}
        target="_blank"
        rel="noreferrer"
        aria-label="Share on WhatsApp"
      >
        <span className="text-sm font-semibold">WA</span>
      </a>
      <a
        className={buttonClass}
        href={`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`}
        target="_blank"
        rel="noreferrer"
        aria-label="Share on X"
      >
        <span className="text-sm font-semibold">X</span>
      </a>
      <a
        className={buttonClass}
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`}
        target="_blank"
        rel="noreferrer"
        aria-label="Share on LinkedIn"
      >
        <Linkedin className="h-4 w-4" />
      </a>
      <button type="button" className={buttonClass} onClick={() => void copyLink()} aria-label="Copy link">
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}
