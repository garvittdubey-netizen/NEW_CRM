import { Link } from 'react-router-dom';
import { MapPin, Bed, Bath, Maximize2, UserCircle, ImageOff } from 'lucide-react';
import { PropertyStatusBadge } from './PropertyStatusBadge';
import { formatPrice, formatArea, buildCloudinaryUrl } from '@/lib/property-format';
import type { Property } from '@/types';

/** List-view row — denser than the card, optimized for scanning many results. */
export function PropertyListRow({ property }: { property: Property }) {
  const cover = property.images[0];
  return (
    <Link
      to={`/properties/${property.id}`}
      className="block group"
      data-testid={`property-row-${property.id}`}
    >
      <div className="flex items-center gap-4 p-3 border-b last:border-0 hover:bg-muted/40 transition-colors">
        <div className="h-20 w-28 shrink-0 bg-muted rounded-md overflow-hidden grid place-items-center">
          {cover ? (
            <img
              src={buildCloudinaryUrl(cover, { width: 220, crop: 'fill' })}
              alt={property.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <ImageOff size={20} className="text-muted-foreground" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold leading-tight truncate">{property.title}</h3>
            <PropertyStatusBadge status={property.status} />
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {property.propertyType}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <MapPin size={11} />
            {property.location}, {property.city}
          </p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5">
            {property.bedrooms != null && (
              <span className="flex items-center gap-1">
                <Bed size={11} /> {property.bedrooms}
              </span>
            )}
            {property.bathrooms != null && (
              <span className="flex items-center gap-1">
                <Bath size={11} /> {property.bathrooms}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Maximize2 size={11} /> {formatArea(property.area, property.areaUnit)}
            </span>
            <span className="flex items-center gap-1 ml-auto">
              <UserCircle size={11} />
              {property.ownerAgent?.name ?? 'Unassigned'}
            </span>
          </div>
        </div>

        <div className="text-right shrink-0 hidden sm:block">
          <p className="text-base font-bold text-primary whitespace-nowrap">
            {formatPrice(property.price)}
          </p>
        </div>
      </div>
    </Link>
  );
}
