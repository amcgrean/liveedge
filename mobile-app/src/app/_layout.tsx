import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ToastProvider, useToast } from '@/context/ToastContext';
import { photoStore } from '@/data/photoStore';
import { outbox } from '@/storage/outbox';
import { initSyncEngine, subscribeSyncEvents } from '@/storage/sync';

function AppBootstrap() {
  const { show } = useToast();

  useEffect(() => {
    outbox.init();
    photoStore.init();
    const stopSync = initSyncEngine();
    const unsubEvents = subscribeSyncEvents((event) => {
      if (event.type === 'synced') {
        show('Synced ✓', 'success');
      }
    });
    return () => {
      unsubEvents();
      stopSync();
    };
  }, [show]);

  return null;
}

function RootStack() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#006834" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppBootstrap />
        <RootStack />
      </AuthProvider>
    </ToastProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
});
