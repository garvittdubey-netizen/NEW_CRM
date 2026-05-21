import api from './api';
import type {
  Property,
  PropertiesResponse,
  CreatePropertyData,
  UpdatePropertyData,
  MatchingLead,
  CloudinarySignature,
} from '@/types';

export interface PropertyListParams {
  page?: number;
  limit?: number;
  search?: string;
  propertyType?: string;
  city?: string;
  status?: string;
  minPrice?: number;
  maxPrice?: number;
  ownerAgentId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const propertiesApi = {
  list: (params: PropertyListParams) =>
    api.get<PropertiesResponse>('/properties', { params }).then((r) => r.data),

  get: (id: string) => api.get<Property>(`/properties/${id}`).then((r) => r.data),

  create: (data: CreatePropertyData) =>
    api.post<Property>('/properties', data).then((r) => r.data),

  update: (id: string, data: UpdatePropertyData) =>
    api.put<Property>(`/properties/${id}`, data).then((r) => r.data),

  delete: (id: string) => api.delete(`/properties/${id}`),

  assign: (id: string, agentId: string | null) =>
    api.patch<Property>(`/properties/${id}/assign`, { agentId }).then((r) => r.data),

  matchingLeads: (id: string) =>
    api
      .get<{ leads: MatchingLead[] }>(`/properties/${id}/matching-leads`)
      .then((r) => r.data.leads),
};

/** Fetches a fresh signed payload from the backend for direct browser upload. */
export const uploadsApi = {
  cloudinarySignature: (folder = 'properties') =>
    api
      .get<CloudinarySignature>('/uploads/cloudinary-signature', { params: { folder } })
      .then((r) => r.data),
};

/**
 * Direct-to-Cloudinary upload. Returns the secure CDN URL on success.
 * Reports progress via the optional callback.
 */
export async function uploadImageToCloudinary(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const sig = await uploadsApi.cloudinarySignature('properties');
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', sig.apiKey);
  form.append('timestamp', String(sig.timestamp));
  form.append('signature', sig.signature);
  form.append('folder', sig.folder);

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', sig.uploadUrl);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.secure_url) {
          resolve(data.secure_url as string);
        } else {
          reject(new Error(data?.error?.message || `Upload failed (${xhr.status})`));
        }
      } catch {
        reject(new Error('Invalid response from Cloudinary'));
      }
    };

    xhr.send(form);
  });
}
