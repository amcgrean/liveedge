import React from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { Toast as ToastType } from '@/context/ToastContext';
import { useToast } from '@/context/ToastContext';

export function ToastContainer() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  const getBackgroundColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'bg-green-600';
      case 'error':
        return 'bg-red-600';
      case 'warning':
        return 'bg-yellow-600';
      default:
        return 'bg-blue-600';
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      case 'warning':
        return '⚠';
      default:
        return 'ℹ';
    }
  };

  return (
    <View className="absolute top-0 left-0 right-0 z-50 pointer-events-none">
      {toasts.map((toast) => (
        <View
          key={toast.id}
          className={`mx-4 mt-4 rounded-lg px-4 py-3 flex-row items-center ${getBackgroundColor(toast.type)}`}
        >
          <Text className="text-white text-lg mr-2">{getIcon(toast.type)}</Text>
          <Text className="flex-1 text-white text-sm font-medium">
            {toast.message}
          </Text>
          {toast.duration === 0 && (
            <TouchableOpacity onPress={() => dismiss(toast.id)}>
              <Text className="text-white text-lg ml-2">✕</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
    </View>
  );
}
