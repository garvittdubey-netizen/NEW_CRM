import { Link } from 'react-router-dom';
import { MapPin, Bed, Bath, Maximize2, UserCircle, ImageOff } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PropertyStatusBadge } from './PropertyStatusBadge';
import { formatPrice, formatArea, buildCloudinaryUrl } from '@/lib/property-format';
import type { Property } from '@/types';

/**
 * Grid-view property card. Click anywhere on the card → detail page.
 * Keeps interactive elements (buttons) out so the whole card behaves as a link.
 */
export function PropertyCard({ property }: { property: Property }) {
  const cover = property.images[0];

  return (
    <Link
      to={`/properties/${property.id}`}
      className="block group"
      data-testid={`property-card-${property.id}`}
    >
      <Card className="overflow-hidden h-full transition-all hover:shadow-lg hover:-translate-y-0.5 hover:border-primary/40">
        {/* Cover image */}
        <div className="relative aspect-[4/3] bg-muted overflow-hidden">
          {cover ? (
            <img
              src={buildCloudinaryUrl(cover, { width: 480, crop: 'fill' })}
              alt={property.title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full grid place-items-center text-muted-foreground">
              <ImageOff size={28} />
            </div>
          )}
          <div className="absolute top-2 left-2">
            <PropertyStatusBadge status={property.status} />
          </div>
          {property.images.length > 1 && (
            <span className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
              +{property.images.length - 1} photos
            </span>
          )}
        </div>

        {/* Body */}
        <div className="p-3.5 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold leading-tight line-clamp-1">{property.title}</h3>
            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap">
              {property.propertyType}
            </span>
          </div>

          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <MapPin size={11} className="shrink-0" />
            <span className="truncate">
              {property.location}, {property.city}
            </span>
          </p>

          <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
            {property.bedrooms != null && (
              <span className="flex items-center gap-1">
                <Bed size={12} /> {property.bedrooms}
              </span>
            )}
            {property.bathrooms != null && (
              <span className="flex items-center gap-1">
                <Bath size={12} /> {property.bathrooms}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Maximize2 size={12} /> {formatArea(property.area, property.areaUnit)}
            </span>
          </div>

          <div className="flex items-end justify-between pt-2 border-t mt-2">
            <p className="text-lg font-bold text-primary">{formatPrice(property.price)}</p>
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <UserCircle size={11} />
              {property.ownerAgent?.name?.split(' ')[0] ?? 'Unassigned'}
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
