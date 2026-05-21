import { Search, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface PropertyFilters {
  search: string;
  propertyType: string;
  city: string;
  status: string;
  minPrice: string;
  maxPrice: string;
}

export const EMPTY_FILTERS: PropertyFilters = {
  search: '',
  propertyType: 'ALL',
  city: '',
  status: 'ALL',
  minPrice: '',
  maxPrice: '',
};

interface Props {
  filters: PropertyFilters;
  onChange: (next: PropertyFilters) => void;
  onClear: () => void;
}

const isDirty = (f: PropertyFilters) =>
  !!(
    f.search ||
    f.city ||
    f.minPrice ||
    f.maxPrice ||
    f.propertyType !== 'ALL' ||
    f.status !== 'ALL'
  );

/**
 * Sticky filter panel for the Properties page. Search lives at the top so
 * it's the primary entry point; structured filters group below it.
 */
export function PropertyFiltersPanel({ filters, onChange, onClear }: Props) {
  const update = <K extends keyof PropertyFilters>(key: K, value: PropertyFilters[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <Card data-testid="property-filters-panel">
      <CardContent className="p-4 space-y-4">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search title, location, city, description..."
            className="pl-9"
            value={filters.search}
            onChange={(e) => update('search', e.target.value)}
            data-testid="property-search-input"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Property Type</Label>
          <Select
            value={filters.propertyType}
            onValueChange={(v) => update('propertyType', v)}
          >
            <SelectTrigger data-testid="property-filter-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Types</SelectItem>
              <SelectItem value="Apartment">Apartment</SelectItem>
              <SelectItem value="Villa">Villa</SelectItem>
              <SelectItem value="Plot">Plot</SelectItem>
              <SelectItem value="Commercial">Commercial</SelectItem>
              <SelectItem value="Penthouse">Penthouse</SelectItem>
              <SelectItem value="Townhouse">Townhouse</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">City</Label>
          <Input
            value={filters.city}
            onChange={(e) => update('city', e.target.value)}
            placeholder="Any city"
            data-testid="property-filter-city"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Status</Label>
          <Select value={filters.status} onValueChange={(v) => update('status', v)}>
            <SelectTrigger data-testid="property-filter-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Status</SelectItem>
              <SelectItem value="AVAILABLE">Available</SelectItem>
              <SelectItem value="RESERVED">Reserved</SelectItem>
              <SelectItem value="SOLD">Sold</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Price Range (₹)</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              placeholder="Min"
              value={filters.minPrice}
              onChange={(e) => update('minPrice', e.target.value)}
              data-testid="property-filter-min-price"
            />
            <span className="text-muted-foreground">—</span>
            <Input
              type="number"
              placeholder="Max"
              value={filters.maxPrice}
              onChange={(e) => update('maxPrice', e.target.value)}
              data-testid="property-filter-max-price"
            />
          </div>
        </div>

        {isDirty(filters) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="w-full"
            data-testid="property-clear-filters"
          >
            <X size={13} className="mr-1.5" /> Clear filters
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
