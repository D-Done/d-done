"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { BoundingBox } from "@/lib/types";

const PDF_DOCUMENT_OPTIONS = {
  disableRange: true,
  disableStream: true,
} as const;

function errorToMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) {
    const msg = (e as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/**
 * Merge bounding boxes that sit on the same line (overlapping y ranges)
 * into continuous highlight strips.
 */
function mergeBoxes(boxes: BoundingBox[]): BoundingBox[] {
  if (boxes.length <= 1) return boxes;

  const sorted = [...boxes].sort((a, b) => {
    const yDiff = a.y0 - b.y0;
    return Math.abs(yDiff) < 0.005 ? a.x0 - b.x0 : yDiff;
  });

  const merged: BoundingBox[] = [];
  let cur = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    const sameRow =
      Math.abs(next.y0 - cur.y0) < 0.01 && Math.abs(next.y1 - cur.y1) < 0.01;
    const adjacent = next.x0 <= cur.x1 + 0.015;

    if (sameRow && adjacent) {
      cur.x0 = Math.min(cur.x0, next.x0);
      cur.x1 = Math.max(cur.x1, next.x1);
      cur.y0 = Math.min(cur.y0, next.y0);
      cur.y1 = Math.max(cur.y1, next.y1);
    } else {
      merged.push(cur);
      cur = { ...next };
    }
  }
  merged.push(cur);
  return merged;
}

function HighlightOverlay({
  boxes,
  containerRef,
}: {
  boxes: BoundingBox[];
  containerRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-10 pointer-events-none"
    >
      {boxes.map((box, i) => (
        <div
          key={i}
          className="absolute pointer-events-none"
          style={{
            left: `${box.x0 * 100}%`,
            top: `${box.y0 * 100}%`,
            width: `${(box.x1 - box.x0) * 100}%`,
            height: `${(box.y1 - box.y0) * 100}%`,
            backgroundColor: "rgba(251, 191, 36, 0.5)",
            borderBottom: "3px solid rgba(245, 158, 11, 0.9)",
            borderRadius: "2px",
          }}
        />
      ))}
    </div>
  );
}

export function PdfCitationViewer({
  url,
  pageNumber,
  boundingBoxes,
  boundingBoxesByPage,
  maxWidth,
  heightClassName,
  onPageSized,
  scrollToHighlight = true,
  allPages = false,
  scrollToPage,
}: {
  url: string;
  pageNumber: number;
  boundingBoxes?: BoundingBox[];
  boundingBoxesByPage?: Record<number, BoundingBox[]>;
  maxWidth?: number;
  heightClassName?: string;
  allPages?: boolean;
  scrollToPage?: number;
  onPageSized?: (width: number) => void;
  scrollToHighlight?: boolean;
}) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [citationPageReady, setCitationPageReady] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const highlightContainerRef = useRef<HTMLDivElement>(null);
  const pageRefsMap = useRef<Map<number, HTMLDivElement | null>>(new Map());
  const hasScrolledToPage = useRef(false);

  useEffect(() => {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }, []);

  const usePerPageBoxes = allPages && boundingBoxesByPage != null;
  const hasBoxes = Array.isArray(boundingBoxes) && boundingBoxes.length > 0;
  const displayBoxes = hasBoxes ? mergeBoxes(boundingBoxes) : [];
  const showHighlight =
    !usePerPageBoxes && citationPageReady && displayBoxes.length > 0;

  // Scroll to highlight once the citation page canvas is rendered and boxes exist.
  useEffect(() => {
    if (scrollToHighlight && showHighlight && highlightContainerRef.current) {
      highlightContainerRef.current.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }
  }, [scrollToHighlight, showHighlight]);

  useEffect(() => {
    hasScrolledToPage.current = false;
  }, [scrollToPage]);

  // In allPages mode, scroll the citation page into view once the doc is loaded.
  useEffect(() => {
    if (
      !allPages ||
      scrollToPage == null ||
      numPages == null ||
      hasScrolledToPage.current
    )
      return;
    const targetPage = Math.round(scrollToPage);
    const el = pageRefsMap.current.get(targetPage);
    if (!el) return;
    hasScrolledToPage.current = true;
    el.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [allPages, scrollToPage, numPages]);

  const handleCitationPageRender = useCallback(() => {
    setCitationPageReady(true);
    if (onPageSized && pageRef.current) {
      const canvas = pageRef.current.querySelector("canvas");
      if (canvas) onPageSized(canvas.clientWidth);
    }
  }, [onPageSized]);

  return (
    <div
      className={[
        "pdf-citation-viewer",
        allPages ? "overflow-y-auto overflow-x-hidden" : "",
        heightClassName,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Document
        file={url}
        options={PDF_DOCUMENT_OPTIONS}
        onLoadSuccess={(pdf) => {
          setNumPages(pdf.numPages);
          setLoadError(null);
          setCitationPageReady(false);
          hasScrolledToPage.current = false;
        }}
        onLoadError={(e) => setLoadError(errorToMessage(e))}
        onSourceError={(e) => setLoadError(errorToMessage(e))}
        loading={
          <div className="p-6 text-center text-sm text-slate-500">
            טוען מסמך...
          </div>
        }
        error={
          <div className="p-6 text-center text-sm text-slate-500">
            לא ניתן לטעון את המסמך.
            {loadError ? (
              <div className="mt-2 text-[11px] text-slate-400 whitespace-pre-wrap">
                {loadError}
              </div>
            ) : null}
          </div>
        }
        className="flex w-full justify-center flex-col items-center"
      >
        {allPages && numPages != null
          ? Array.from({ length: numPages }, (_, i) => {
              const p = i + 1;
              const isCitationPage = p === pageNumber;
              const boxesForPage =
                usePerPageBoxes && boundingBoxesByPage
                  ? mergeBoxes(boundingBoxesByPage[p] ?? [])
                  : [];
              const showOverlayOnPage = usePerPageBoxes
                ? boxesForPage.length > 0
                : isCitationPage && showHighlight;
              const overlayBoxes = usePerPageBoxes
                ? boxesForPage
                : displayBoxes;
              return (
                <div
                  key={p}
                  ref={(el) => {
                    pageRefsMap.current.set(p, el);
                    if (isCitationPage) pageRef.current = el;
                  }}
                  className="relative mt-2 first:mt-0"
                  style={{ display: "inline-block" }}
                >
                  <Page
                    pageNumber={p}
                    width={maxWidth}
                    className="pdf-citation-page"
                    renderAnnotationLayer={false}
                    renderTextLayer={false}
                    onRenderSuccess={
                      isCitationPage ? handleCitationPageRender : undefined
                    }
                    loading={
                      <div className="p-6 text-center text-sm text-slate-500 min-h-[200px]">
                        טוען עמוד {p}...
                      </div>
                    }
                  />
                  {showOverlayOnPage && overlayBoxes.length > 0 ? (
                    <HighlightOverlay
                      boxes={overlayBoxes}
                      containerRef={
                        isCitationPage ? highlightContainerRef : undefined
                      }
                    />
                  ) : null}
                </div>
              );
            })
          : (
            <div
              className="relative"
              style={{ display: "inline-block" }}
              ref={pageRef}
            >
              <Page
                pageNumber={
                  numPages
                    ? Math.min(Math.max(pageNumber, 1), numPages)
                    : pageNumber
                }
                width={maxWidth}
                className="pdf-citation-page"
                renderAnnotationLayer={false}
                renderTextLayer={false}
                onRenderSuccess={handleCitationPageRender}
                loading={
                  <div className="p-6 text-center text-sm text-slate-500">
                    טוען עמוד...
                  </div>
                }
              />
              {showHighlight ? (
                <HighlightOverlay
                  boxes={displayBoxes}
                  containerRef={highlightContainerRef}
                />
              ) : null}
            </div>
          )}
      </Document>
    </div>
  );
}
