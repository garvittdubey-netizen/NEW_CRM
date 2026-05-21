import { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import PropertyImageUploader from './PropertyImageUploader';
import { propertiesApi } from '@/services/properties';
import { agentsApi, type AgentOption } from '@/services/leads';
import { extractApiError } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import type {
  Property,
  CreatePropertyData,
  PropertyStatus,
  AreaUnit,
} from '@/types';
import { isAdminLevel } from '@/lib/roles';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  property?: Property | null;
}

const EMPTY: CreatePropertyData = {
  title: '',
  propertyType: 'Apartment',
  location: '',
  city: '',
  price: 0,
  area: 0,
  areaUnit: 'SQFT',
  bedrooms: null,
  bathrooms: null,
  status: 'AVAILABLE',
  description: '',
  images: [],
  ownerAgentId: null,
};

export function PropertyFormModal({ open, onClose, onSuccess, property }: Props) {
  const isEdit = !!property;
  const { user } = useAuth();
  const isAdmin = isAdminLevel(user?.role);

  const [form, setForm] = useState<CreatePropertyData>(EMPTY);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');

    if (property) {
      setForm({
        title: property.title,
        propertyType: property.propertyType,
        location: property.location,
        city: property.city,
        price: property.price,
        area: property.area,
        areaUnit: property.areaUnit,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        status: property.status,
        description: property.description ?? '',
        images: property.images,
        ownerAgentId: property.ownerAgentId,
      });
    } else {
      setForm(EMPTY);
    }

    // Owner reassignment is admin-only.
    if (isAdmin) {
      agentsApi.list().then(setAgents).catch(() => setAgents([]));
    }
  }, [open, property, isAdmin]);

  const set = <K extends keyof CreatePropertyData>(key: K) =>
    (value: CreatePropertyData[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!form.title.trim()) return setError('Title is required');
    if (!form.location.trim()) return setError('Location is required');
    if (!form.city.trim()) return setError('City is required');
    if (!form.price || form.price <= 0) return setError('Price must be greater than 0');
    if (!form.area || form.area <= 0) return setError('Area must be greater than 0');

    setLoading(true);
    setError('');
    try {
      const payload: CreatePropertyData = {
        ...form,
        description: form.description?.trim() || undefined,
        bedrooms: form.bedrooms ?? null,
        bathrooms: form.bathrooms ?? null,
      };
      if (isEdit) await propertiesApi.update(property!.id, payload);
      else await propertiesApi.create(payload);
      onSuccess();
      onClose();
    } catch (e) {
      setError(extractApiError(e, 'Failed to save property. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0 border-b">
          <DialogTitle>{isEdit ? 'Edit Property' : 'Add New Property'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <div
              className="flex items-start gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md"
              data-testid="property-form-error"
            >
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="pf-title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="pf-title"
              value={form.title}
              onChange={(e) => set('title')(e.target.value)}
              placeholder="Sea-facing 3BHK in Bandra West"
              data-testid="property-title-input"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Property Type</Label>
              <Select value={form.propertyType} onValueChange={set('propertyType')}>
                <SelectTrigger data-testid="property-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
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
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => set('status')(v as PropertyStatus)}
              >
                <SelectTrigger data-testid="property-status-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AVAILABLE">Available</SelectItem>
                  <SelectItem value="RESERVED">Reserved</SelectItem>
                  <SelectItem value="SOLD">Sold</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pf-location">
                Location <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pf-location"
                value={form.location}
                onChange={(e) => set('location')(e.target.value)}
                placeholder="Bandra West"
                data-testid="property-location-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-city">
                City <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pf-city"
                value={form.city}
                onChange={(e) => set('city')(e.target.value)}
                placeholder="Mumbai"
                data-testid="property-city-input"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pf-price">
                Price (₹) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pf-price"
                type="number"
                value={form.price || ''}
                onChange={(e) => set('price')(e.target.value ? Number(e.target.value) : 0)}
                placeholder="35000000"
                data-testid="property-price-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Area</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={form.area || ''}
                  onChange={(e) => set('area')(e.target.value ? Number(e.target.value) : 0)}
                  placeholder="1500"
                  className="flex-1"
                  data-testid="property-area-input"
                />
                <Select
                  value={form.areaUnit || 'SQFT'}
                  onValueChange={(v) => set('areaUnit')(v as AreaUnit)}
                >
                  <SelectTrigger className="w-24" data-testid="property-areaunit-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SQFT">SQFT</SelectItem>
                    <SelectItem value="SQM">SQM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pf-bedrooms">Bedrooms</Label>
              <Input
                id="pf-bedrooms"
                type="number"
                value={form.bedrooms ?? ''}
                onChange={(e) =>
                  set('bedrooms')(e.target.value ? Number(e.target.value) : null)
                }
                placeholder="3"
                data-testid="property-bedrooms-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-bathrooms">Bathrooms</Label>
              <Input
                id="pf-bathrooms"
                type="number"
                value={form.bathrooms ?? ''}
                onChange={(e) =>
                  set('bathrooms')(e.target.value ? Number(e.target.value) : null)
                }
                placeholder="3"
                data-testid="property-bathrooms-input"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Images</Label>
            <PropertyImageUploader
              value={form.images ?? []}
              onChange={set('images')}
            />
          </div>

          {isAdmin && (
            <div className="space-y-1.5">
              <Label>Owner Agent</Label>
              <Select
                value={form.ownerAgentId || 'NONE'}
                onValueChange={(v) => set('ownerAgentId')(v === 'NONE' ? null : v)}
              >
                <SelectTrigger data-testid="property-owner-select">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Unassigned</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="pf-desc">Description</Label>
            <Textarea
              id="pf-desc"
              value={form.description}
              onChange={(e) => set('description')(e.target.value)}
              placeholder="Premium sea-facing apartment with panoramic views..."
              rows={4}
              data-testid="property-description-textarea"
            />
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0 gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading} data-testid="property-form-submit">
            {loading ? 'Saving...' : isEdit ? 'Update Property' : 'Add Property'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
