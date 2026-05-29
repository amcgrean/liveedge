import React from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

export default function Index() {
  const { isSignedIn, user } = useAuth();
  console.log('[INDEX_ROUTE] isSignedIn:', isSignedIn, 'branch:', user?.branch);

  if (!isSignedIn) {
    return <Redirect href="/(auth)/login" />;
  }
  // After login, force branch selection if not already chosen
  if (!user?.branch) {
    return <Redirect href="/(auth)/branch-select" />;
  }
  return <Redirect href="/(app)/route-list" />;
}
