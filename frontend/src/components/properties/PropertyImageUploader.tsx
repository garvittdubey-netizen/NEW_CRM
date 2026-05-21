import { useRef, useState } from 'react';
import { ImagePlus, X, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { uploadImageToCloudinary } from '@/services/properties';
import { buildCloudinaryUrl } from '@/lib/property-format';

interface Props {
  value: string[];
  onChange: (urls: string[]) => void;
  maxFiles?: number;
  maxSizeMb?: number;
}

interface UploadingFile {
  localId: string;
  name: string;
  previewUrl: string;
  progress: number;
  error?: string;
}

/**
 * Cloudinary-backed multi-image uploader.
 *   - Drag-and-drop OR click-to-pick
 *   - Per-file progress bar
 *   - Local previews while uploading (no flicker once the secure URL arrives)
 *   - Remove from the staged list (deletes the URL from the Property.images[])
 *   - Validates type (image/*) and size (default ≤ 8 MB) client-side
 *
 * The component is fully controlled — the parent owns the `images: string[]`.
 */
export default function PropertyImageUploader({
  value,
  onChange,
  maxFiles = 10,
  maxSizeMb = 8,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = async (filesList: FileList | File[]) => {
    const files = Array.from(filesList);
    const remaining = maxFiles - value.length - uploading.length;
    const accepted = files.slice(0, Math.max(0, remaining));

    for (const file of accepted) {
      const localId = `${file.name}-${Date.now()}-${Math.random()}`;

      if (!file.type.startsWith('image/')) {
        setUploading((u) => [
          ...u,
          { localId, name: file.name, previewUrl: '', progress: 0, error: 'Not an image' },
        ]);
        continue;
      }
      if (file.size > maxSizeMb * 1024 * 1024) {
        setUploading((u) => [
          ...u,
          {
            localId,
            name: file.name,
            previewUrl: '',
            progress: 0,
            error: `File exceeds ${maxSizeMb} MB`,
          },
        ]);
        continue;
      }

      const previewUrl = URL.createObjectURL(file);
      setUploading((u) => [...u, { localId, name: file.name, previewUrl, progress: 0 }]);

      try {
        const secureUrl = await uploadImageToCloudinary(file, (pct) => {
          setUploading((u) => u.map((f) => (f.localId === localId ? { ...f, progress: pct } : f)));
        });
        // Append the new URL to the controlled value and drop the staged entry.
        onChange([...value, secureUrl]);
        URL.revokeObjectURL(previewUrl);
        setUploading((u) => u.filter((f) => f.localId !== localId));
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Upload failed';
        setUploading((u) => u.map((f) => (f.localId === localId ? { ...f, error: msg } : f)));
      }
    }
  };

  const removeUrl = (url: string) => onChange(value.filter((u) => u !== url));
  const removeFailed = (localId: string) =>
    setUploading((u) => u.filter((f) => f.localId !== localId));

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  };

  const total = value.length + uploading.length;
  const canAdd = total < maxFiles;

  return (
    <div className="space-y-3" data-testid="property-image-uploader">
      {/* Dropzone */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => canAdd && inputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer',
          dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
          !canAdd && 'opacity-60 cursor-not-allowed',
        )}
        data-testid="property-image-dropzone"
      >
        <ImagePlus size={28} className="mx-auto text-muted-foreground mb-2" />
        <p className="text-sm font-medium">
          {canAdd ? 'Drop images here or click to upload' : `Limit of ${maxFiles} images reached`}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          PNG / JPG / WebP — up to {maxSizeMb} MB each · {total}/{maxFiles} added
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          data-testid="property-image-input"
        />
      </div>

      {/* Thumbnails grid */}
      {(value.length > 0 || uploading.length > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
          {value.map((url) => (
            <div
              key={url}
              className="relative aspect-square rounded-md overflow-hidden group bg-muted"
              data-testid="property-image-thumb"
            >
              <img
                src={buildCloudinaryUrl(url, { width: 300, crop: 'fill' })}
                alt=""
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeUrl(url)}
                className="absolute top-1 right-1 h-7 w-7 rounded-full bg-black/65 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Remove image"
                data-testid="remove-image-button"
              >
                <X size={13} />
              </button>
            </div>
          ))}
          {uploading.map((f) => (
            <div
              key={f.localId}
              className="relative aspect-square rounded-md overflow-hidden bg-muted border"
              data-testid="property-image-uploading"
            >
              {f.previewUrl && (
                <img src={f.previewUrl} alt="" className="w-full h-full object-cover opacity-60" />
              )}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-2 text-center">
                {f.error ? (
                  <>
                    <AlertCircle size={20} className="text-destructive" />
                    <p className="text-[10px] text-destructive font-medium leading-tight">
                      {f.error}
                    </p>
                    <button
                      type="button"
                      onClick={() => removeFailed(f.localId)}
                      className="text-[10px] underline text-muted-foreground"
                    >
                      dismiss
                    </button>
                  </>
                ) : (
                  <>
                    <Loader2 size={18} className="animate-spin text-primary" />
                    <div className="w-full h-1 bg-background rounded">
                      <div
                        className="h-1 bg-primary rounded transition-all"
                        style={{ width: `${f.progress}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">{f.progress}%</p>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
