// Reusable image upload with preview backed by S3/local storage API.

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { api } from "../../../lib/api/client";

interface ImageUploadProps {
  label: string;
  value?: string;
  onChange: (url: string) => void;
  uploadKind: "logo" | "service-image";
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
        uploadKind === "logo" ? await api.uploadLogo(file) : await api.uploadServiceImage(file);
      onChange(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <div>
        <Label>{label}</Label>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </div>
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <button
          type="button"
          onClick={() => !disabled && !isUploading && inputRef.current?.click()}
          disabled={disabled || isUploading}
          className="w-full sm:w-28 h-28 rounded-xl border border-dashed border-border bg-card overflow-hidden flex items-center justify-center shrink-0 transition-colors hover:border-primary/40 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {value ? (
            <img src={value} alt="" className="w-full h-full object-cover" />
          ) : (
            <ImagePlus className="w-8 h-8 text-muted-foreground" />
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
              disabled={disabled || isUploading}
              onClick={() => inputRef.current?.click()}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : value ? (
                "Change image"
              ) : (
                "Upload image"
              )}
            </Button>
            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || isUploading}
                onClick={() => onChange("")}
              >
                <X className="w-4 h-4 mr-1" />
                Remove
              </Button>
            )}
          </div>
          {value && !error && (
            <p className="text-xs text-accent">Image uploaded. Save the form below to keep it.</p>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
