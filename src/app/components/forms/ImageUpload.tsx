// Reusable image upload with preview backed by S3/local storage API.

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X, CheckCircle2 } from "lucide-react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { api } from "../../../lib/api/client";
import { resolveMediaUrl } from "../../../lib/media";

interface ImageUploadProps {
  label: string;
  value?: string;
  onChange: (url: string) => void;
  uploadKind: "logo" | "service-image" | "listing-image";
  disabled?: boolean;
  hint?: string;
}

export function ImageUpload({ label, value, onChange, uploadKind, disabled, hint }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setError("");
    setIsUploading(true);
    try {
      const result =
        uploadKind === "logo"
          ? await api.uploadLogo(file)
          : uploadKind === "listing-image"
            ? await api.uploadListingImage(file)
            : await api.uploadServiceImage(file);
      onChange(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5 space-y-3">
      <div>
        <Label className="text-xs font-semibold uppercase tracking-wider text-slate-700">{label}</Label>
        {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <button
          type="button"
          onClick={() => !disabled && !isUploading && inputRef.current?.click()}
          disabled={disabled || isUploading}
          className="relative group w-full sm:w-28 h-28 rounded-2xl border-2 border-dashed border-slate-300 bg-white overflow-hidden flex items-center justify-center shrink-0 transition-all hover:border-slate-900 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
        >
          {value ? (
            <img
              src={resolveMediaUrl(value)}
              alt={`${label} preview`}
              className="w-full h-full object-contain p-2 transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-slate-400 group-hover:text-slate-900 transition-colors">
              <ImagePlus className="w-7 h-7" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Browse</span>
            </div>
          )}
        </button>
        <div className="flex-1 space-y-2 min-w-0">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            disabled={disabled || isUploading}
            onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 font-semibold shadow-sm"
              disabled={disabled || isUploading}
              onClick={() => inputRef.current?.click()}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin text-slate-900" />
                  Uploading...
                </>
              ) : value ? (
                "Change Image"
              ) : (
                "Upload Image"
              )}
            </Button>
            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-xl text-slate-500 hover:text-red-600 hover:bg-red-50 font-medium"
                disabled={disabled || isUploading}
                onClick={() => onChange("")}
              >
                <X className="w-4 h-4 mr-1" />
                Remove
              </Button>
            )}
          </div>
          {value && !error && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold" role="status" aria-live="polite">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Image uploaded & attached to live preview</span>
            </div>
          )}
          {error && (
            <p className="text-xs text-red-600 font-semibold" role="alert" aria-live="assertive">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}


