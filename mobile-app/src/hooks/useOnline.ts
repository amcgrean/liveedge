import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { syncNow } from '@/storage/sync';

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let wasOnline = online;
    const apply = (nextOnline: boolean) => {
      setOnline(nextOnline);
      if (!wasOnline && nextOnline) {
        syncNow();
      }
      wasOnline = nextOnline;
    };

    const unsub = NetInfo.addEventListener((state) => {
      apply(Boolean(state.isConnected && state.isInternetReachable !== false));
    });

    NetInfo.fetch().then((state) => {
      apply(Boolean(state.isConnected && state.isInternetReachable !== false));
    });

    return unsub;
  }, []);

  return online;
}
