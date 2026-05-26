'use client';

import { X } from 'lucide-react';

export interface PodPhoto {
  id: number;
  r2_key: string;
  filename: string;
  content_type: string;
  category: string;
  driver_name: string | null;
  notes: string | null;
  taken_at: string;
  url: string;
}

interface Props {
  photos: PodPhoto[] | null;
  loading: boolean;
  lightboxUrl: string | null;
  onPhotoClick: (url: string) => void;
  onLightboxClose: () => void;
}

export function PodPhotoViewer({ photos, loading, lightboxUrl, onPhotoClick, onLightboxClose }: Props) {
  return (
    <>
      {/* Thumbnail strip — only shown when loading or at least one photo exists */}
      {(loading || (photos && photos.length > 0)) && (
        <div className="border-b border-gray-700 shrink-0 px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
            Proof of Delivery{photos && photos.length > 0 ? ` · ${photos.length}` : ''}
          </div>
          {loading ? (
            <div className="text-xs text-gray-600">Loading photos…</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {photos!.map((photo) => (
                <button
                  key={photo.id}
                  onClick={() => onPhotoClick(photo.url)}
                  className="relative w-16 h-16 rounded overflow-hidden border border-gray-700 hover:border-cyan-500 transition-colors shrink-0 bg-gray-800"
                  title={photo.filename}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.filename}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lightbox overlay */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/85"
          onClick={onLightboxClose}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="POD photo"
            className="max-w-[90vw] max-h-[90vh] rounded shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white"
            onClick={onLightboxClose}
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      )}
    </>
  );
}
