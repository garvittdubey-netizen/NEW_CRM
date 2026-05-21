/** Formats a price in INR with Cr/L suffixes for readability. */
export function formatPrice(price: number | null | undefined): string {
  if (price == null) return '—';
  if (price >= 10000000) return `₹${(price / 10000000).toFixed(2)} Cr`;
  if (price >= 100000) return `₹${(price / 100000).toFixed(2)} L`;
  return `₹${price.toLocaleString('en-IN')}`;
}

/** Formats area + unit, e.g. "1200 SQFT" or "95 SQM". */
export function formatArea(area: number | null | undefined, unit: 'SQFT' | 'SQM'): string {
  if (area == null) return '—';
  const rounded = Number.isInteger(area) ? area : Number(area.toFixed(1));
  return `${rounded} ${unit}`;
}

/**
 * Builds a transformed Cloudinary URL with auto quality + auto format and
 * an optional width cap. Cloudinary will then return a WebP/AVIF/JPEG
 * variant sized to fit, drastically smaller than the original upload.
 *
 *   buildCloudinaryUrl(url, { width: 600 })
 */
export function buildCloudinaryUrl(
  url: string,
  opts: { width?: number; height?: number; crop?: 'fill' | 'fit' } = {},
): string {
  if (!url.includes('/upload/')) return url;
  const transforms: string[] = ['q_auto', 'f_auto'];
  if (opts.width) transforms.push(`w_${opts.width}`);
  if (opts.height) transforms.push(`h_${opts.height}`);
  if (opts.crop) transforms.push(`c_${opts.crop}`);
  return url.replace('/upload/', `/upload/${transforms.join(',')}/`);
}
