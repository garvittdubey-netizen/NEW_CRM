import { useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import { buildCloudinaryUrl } from '@/lib/property-format';
import { cn } from '@/lib/utils';

/**
 * Image gallery for the property detail page. Hero image + thumbnail strip.
 * Falls back gracefully when no images are uploaded.
 */
export function PropertyImageGallery({ images, alt }: { images: string[]; alt: string }) {
  const [index, setIndex] = useState(0);

  if (!images.length) {
    return (
      <div
        className="w-full aspect-[16/10] rounded-lg bg-muted grid place-items-center text-muted-foreground"
        data-testid="property-gallery-empty"
      >
        <div className="text-center">
          <ImageOff size={32} className="mx-auto mb-2" />
          <p className="text-sm">No images uploaded</p>
        </div>
      </div>
    );
  }

  const safeIndex = Math.min(index, images.length - 1);
  const heroUrl = buildCloudinaryUrl(images[safeIndex], { width: 1200 });

  const prev = () => setIndex((i) => (i === 0 ? images.length - 1 : i - 1));
  const next = () => setIndex((i) => (i === images.length - 1 ? 0 : i + 1));

  return (
    <div className="space-y-2" data-testid="property-gallery">
      <div className="relative w-full aspect-[16/10] rounded-lg overflow-hidden bg-muted">
        <img
          src={heroUrl}
          alt={alt}
          className="w-full h-full object-cover"
          data-testid="property-gallery-hero"
        />
        {images.length > 1 && (
          <>
            <button
              onClick={prev}
              aria-label="Previous image"
              className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/55 text-white grid place-items-center hover:bg-black/75 transition-colors"
              data-testid="property-gallery-prev"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={next}
              aria-label="Next image"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/55 text-white grid place-items-center hover:bg-black/75 transition-colors"
              data-testid="property-gallery-next"
            >
              <ChevronRight size={18} />
            </button>
            <span className="absolute bottom-2 right-2 text-[11px] bg-black/55 text-white px-2 py-0.5 rounded">
              {safeIndex + 1} / {images.length}
            </span>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((url, i) => (
            <button
              key={url}
              onClick={() => setIndex(i)}
              className={cn(
                'h-16 w-20 rounded-md overflow-hidden border-2 shrink-0 transition-all',
                i === safeIndex
                  ? 'border-primary ring-2 ring-primary/20'
                  : 'border-transparent opacity-70 hover:opacity-100',
              )}
              data-testid={`property-gallery-thumb-${i}`}
            >
              <img
                src={buildCloudinaryUrl(url, { width: 160, crop: 'fill' })}
                alt={`${alt} ${i + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
