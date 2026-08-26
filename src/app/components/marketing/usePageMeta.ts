import { useEffect } from "react";
import { applyPageMeta, type PageMetaOptions } from "../../../lib/seo";

/** Sets document title, meta description, Open Graph, and canonical for a route. */
export function usePageMeta(options: PageMetaOptions) {
  const jsonLdKey = options.jsonLd ? JSON.stringify(options.jsonLd) : "";
  useEffect(() => {
    applyPageMeta(options);
  }, [options.title, options.description, options.path, options.image, options.noindex, jsonLdKey]);
}
