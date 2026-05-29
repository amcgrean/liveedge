import React, { useRef, useState } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

interface PhotoCameraProps {
  onPhotoCapture: (photoUri: string) => Promise<void>;
  isVisible: boolean;
  onClose: () => void;
}

export function PhotoCamera({
  onPhotoCapture,
  isVisible,
  onClose,
}: PhotoCameraProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const handleCapture = async () => {
    try {
      setIsCapturing(true);
      if (!cameraRef.current) return;

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        skipProcessing: false,
      });

      if (photo) {
        await onPhotoCapture(photo.uri);
      }
    } catch (error) {
      console.error('Failed to capture photo:', error);
    } finally {
      setIsCapturing(false);
    }
  };

  const handlePermission = async () => {
    const result = await requestPermission();
    if (!result.granted) {
      alert('Camera permission is required to take photos');
    }
  };

  if (!permission) {
    return (
      <Modal visible={isVisible} transparent animationType="slide">
        <View className="flex-1 justify-center items-center bg-black/50">
          <View className="bg-white rounded-lg p-6">
            <Text className="text-lg font-semibold mb-4">Camera Permission</Text>
            <Text className="text-gray-700 mb-4">
              We need permission to access your camera for photos
            </Text>
            <TouchableOpacity
              onPress={handlePermission}
              className="bg-green-700 rounded-lg px-6 py-3"
            >
              <Text className="text-white font-semibold text-center">Grant Permission</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  if (!permission.granted) {
    return (
      <Modal visible={isVisible} transparent animationType="slide">
        <View className="flex-1 justify-center items-center bg-black/50">
          <View className="bg-white rounded-lg p-6">
            <Text className="text-lg font-semibold mb-4">Camera Not Available</Text>
            <Text className="text-gray-700 mb-4">
              Please enable camera permission in Settings
            </Text>
            <TouchableOpacity onPress={onClose} className="bg-gray-700 rounded-lg px-6 py-3">
              <Text className="text-white font-semibold text-center">Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={isVisible} transparent animationType="slide">
      <View className="flex-1 bg-black">
        <CameraView ref={cameraRef} className="flex-1" facing="back">
          {/* Camera Controls */}
          <View className="absolute bottom-0 left-0 right-0 flex-row justify-around items-center bg-black/40 p-6">
            {/* Close Button */}
            <TouchableOpacity
              onPress={onClose}
              disabled={isCapturing}
              className="bg-gray-700 rounded-full w-14 h-14 justify-center items-center"
            >
              <Text className="text-white text-2xl">✕</Text>
            </TouchableOpacity>

            {/* Capture Button */}
            <TouchableOpacity
              onPress={handleCapture}
              disabled={isCapturing}
              className="bg-green-600 rounded-full w-20 h-20 justify-center items-center"
            >
              {isCapturing ? (
                <ActivityIndicator color="white" size="large" />
              ) : (
                <View className="w-16 h-16 rounded-full border-4 border-white" />
              )}
            </TouchableOpacity>

            {/* Placeholder */}
            <View className="w-14 h-14" />
          </View>
        </CameraView>
      </View>
    </Modal>
  );
}
