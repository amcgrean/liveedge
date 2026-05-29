import { useState, useRef } from 'react';
import { CameraView } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import uuid from 'uuid';

export interface CapturedPhoto {
  id: string;
  uri: string;
  timestamp: number;
}

export function usePhotoCapture() {
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const cameraRef = useRef<CameraView>(null);

  const capturePhoto = async (): Promise<CapturedPhoto | null> => {
    try {
      if (!cameraRef.current) return null;

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7, // Compress to 70% quality
        skipProcessing: false,
      });

      if (!photo) return null;

      const photoId = uuid.v4();
      const fileName = `${photoId}.jpg`;
      const photoPath = `${FileSystem.documentDirectory}photos/${fileName}`;

      // Ensure directory exists
      await FileSystem.makeDirectoryAsync(
        `${FileSystem.documentDirectory}photos`,
        { intermediates: true }
      );

      // Copy photo to local storage
      await FileSystem.copyAsync({
        from: photo.uri,
        to: photoPath,
      });

      const capturedPhoto: CapturedPhoto = {
        id: photoId,
        uri: photoPath,
        timestamp: Date.now(),
      };

      setPhotos((prev) => [...prev, capturedPhoto]);
      return capturedPhoto;
    } catch (error) {
      console.error('Failed to capture photo:', error);
      return null;
    }
  };

  const removePhoto = (photoId: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
  };

  const clearPhotos = () => {
    setPhotos([]);
  };

  return {
    photos,
    cameraRef,
    capturePhoto,
    removePhoto,
    clearPhotos,
  };
}
