import React from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  Text,
  ScrollView,
} from 'react-native';
import { CapturedPhoto } from '@/hooks/usePhotoCapture';

interface PhotoGridProps {
  photos: CapturedPhoto[];
  onRemove: (photoId: string) => void;
  onCapture: () => void;
}

export function PhotoGrid({ photos, onRemove, onCapture }: PhotoGridProps) {
  return (
    <View className="bg-gray-100 p-4">
      <View className="flex-row justify-between items-center mb-4">
        <Text className="text-lg font-semibold text-gray-900">
          Photos ({photos.length})
        </Text>
        <TouchableOpacity
          onPress={onCapture}
          className="bg-green-700 rounded-lg px-4 py-2 flex-row items-center"
        >
          <Text className="text-white mr-2">📷</Text>
          <Text className="text-white font-semibold">Add Photo</Text>
        </TouchableOpacity>
      </View>

      {photos.length === 0 ? (
        <View className="bg-white rounded-lg p-6 justify-center items-center">
          <Text className="text-gray-500 mb-4">No photos yet</Text>
          <TouchableOpacity
            onPress={onCapture}
            className="bg-blue-600 rounded-lg px-6 py-3"
          >
            <Text className="text-white font-semibold">Take a Photo</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {photos.map((photo) => (
            <View key={photo.id} className="mr-4 mb-4">
              <Image
                source={{ uri: photo.uri }}
                className="w-24 h-24 rounded-lg bg-gray-300"
              />
              <TouchableOpacity
                onPress={() => onRemove(photo.id)}
                className="absolute -top-2 -right-2 bg-red-600 rounded-full w-6 h-6 justify-center items-center"
              >
                <Text className="text-white text-sm">✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
