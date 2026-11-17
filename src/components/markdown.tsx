"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Renders user-written Markdown (GitHub flavour: tables, task lists, strikethrough).
 * react-markdown builds React elements and ignores raw HTML, so user content cannot
 * inject markup or scripts.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("markdown", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: content }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {content}
            </a>
          ),
          img: ({ src, alt }) =>
            typeof src === "string" ? (
              <a href={src} target="_blank" rel="noopener noreferrer" title="Abrir imagem em outra aba">
                {/* Pasted images have unknown dimensions and are served by our own authenticated route. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={alt ?? ""} loading="lazy" />
              </a>
            ) : null,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
