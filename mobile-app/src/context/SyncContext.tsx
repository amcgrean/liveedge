import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from './AuthContext';
import * as outbox from '@/storage/outbox';
import * as syncEngine from '@/storage/sync';

interface SyncContextType {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  startSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Monitor network status
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected && state.isInternetReachable !== false;
      setIsOnline(online);

      // Auto-sync when coming back online
      if (online && session?.token) {
        startSync();
      }
    });

    return unsubscribe;
  }, [session]);

  // Periodically check pending count
  useEffect(() => {
    const checkPending = async () => {
      const count = await outbox.getPendingCount();
      setPendingCount(count);
    };

    checkPending();
    const interval = setInterval(checkPending, 10000); // Check every 10s

    return () => clearInterval(interval);
  }, []);

  const startSync = async () => {
    if (isSyncing || !isOnline || !session?.token) return;

    setIsSyncing(true);
    try {
      const result = await syncEngine.syncPendingDeliveries({
        token: session.token,
        maxRetries: 3,
      });

      // Update pending count
      const count = await outbox.getPendingCount();
      setPendingCount(count);
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <SyncContext.Provider value={{ isOnline, isSyncing, pendingCount, startSync }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error('useSync must be used within SyncProvider');
  }
  return context;
}
