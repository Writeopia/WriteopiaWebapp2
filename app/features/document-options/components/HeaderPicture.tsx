import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { cn } from "~/core/ui";

import { contentRows, coverPlacement, type Rows, type Size } from "../header";

/** The picture is read at most this tall to find its drawing; the rows scale back after. */
const ANALYSIS_HEIGHT = 768;

/**
 * Finds the rows of the drawing of a picture (HeaderPictureCrop). The picture is read again
 * with CORS for its pixels; when its server does not allow that, the whole picture is used.
 */
function useContentRows(url: string): { size: Size; rows: Rows } | null {
  const [found, setFound] = useState<{ url: string; size: Size; rows: Rows } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (cancelled) return;
      const size = { width: image.naturalWidth, height: image.naturalHeight };
      setFound({ url, size, rows: readRows(image, size) });
    };
    image.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  return found?.url === url ? found : null;
}

function readRows(image: HTMLImageElement, size: Size): Rows {
  const whole = { top: 0, bottom: size.height };
  try {
    const ratio = Math.min(1, ANALYSIS_HEIGHT / size.height);
    const width = Math.max(1, Math.round(size.width * ratio));
    const height = Math.max(1, Math.round(size.height * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return whole;
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const rows = contentRows(width, height, (x, y) => {
      const at = (y * width + x) * 4;
      return (pixels[at]! * 299 + pixels[at + 1]! * 587 + pixels[at + 2]! * 114) / 1000;
    });
    return { top: rows.top / ratio, bottom: Math.min(size.height, rows.bottom / ratio) };
  } catch {
    // A picture whose server refuses CORS cannot be read: it is drawn whole.
    return whole;
  }
}

type HeaderPictureProps = {
  url: string;
  alt: string;
  className?: string;
};

/**
 * A header picture covering its box, with the drawing of the picture in the middle of the band
 * like on desktop and iOS. Until the picture is read it is centered as a plain cover.
 */
export function HeaderPicture({ url, alt, className }: HeaderPictureProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [band, setBand] = useState<Size | null>(null);
  const found = useContentRows(url);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => setBand({ width: box.clientWidth, height: box.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const placement =
    found && band && band.width > 0 && band.height > 0
      ? coverPlacement(found.size, found.rows, band)
      : null;

  return (
    <div ref={boxRef} className={cn("relative overflow-hidden bg-light-bg", className)}>
      <img
        src={url}
        alt={alt}
        draggable={false}
        className={cn("absolute max-w-none", !placement && "inset-0 size-full object-cover")}
        style={
          placement && found
            ? {
                left: placement.x,
                top: placement.y,
                width: found.size.width * placement.scale,
                height: found.size.height * placement.scale,
              }
            : undefined
        }
      />
    </div>
  );
}
