import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useSync } from '@/context/SyncContext';

export function SyncStatus() {
  const { isOnline, isSyncing, pendingCount } = useSync();

  if (isOnline && !isSyncing && pendingCount === 0) {
    return null; // Don't show when everything is good
  }

  return (
    <View className="bg-blue-100 px-4 py-2 flex-row items-center justify-between">
      <View className="flex-row items-center flex-1">
        {!isOnline && (
          <>
            <View className="w-2 h-2 rounded-full bg-red-600 mr-2" />
            <Text className="text-sm text-gray-800">No connection</Text>
          </>
        )}

        {isOnline && isSyncing && (
          <>
            <ActivityIndicator size="small" color="#0066cc" style={{ marginRight: 8 }} />
            <Text className="text-sm text-gray-800">Syncing...</Text>
          </>
        )}

        {isOnline && !isSyncing && pendingCount > 0 && (
          <>
            <View className="w-2 h-2 rounded-full bg-yellow-600 mr-2" />
            <Text className="text-sm text-gray-800">
              {pendingCount} pending
            </Text>
          </>
        )}
      </View>
    </View>
  );
}
