import React from 'react';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useRole } from '@/context/RoleContext';

/**
 * App entry router. One binary, two role-gated experiences:
 *   not signed in        → login
 *   no branch chosen      → branch picker
 *   dual-role, no choice  → role switcher
 *   active role 'driver'  → driver route list  (existing)
 *   active role 'sales'   → sales home          (this section)
 */
export default function Index() {
  const { isSignedIn, user } = useAuth();
  const { activeRole, isLoading: roleLoading, isDualRole } = useRole();

  if (!isSignedIn) {
    return <Redirect href="/(auth)/login" />;
  }
  // After login, force branch selection if not already chosen.
  if (!user?.branch) {
    return <Redirect href="/(auth)/branch-select" />;
  }
  // Wait for the persisted role choice to restore.
  if (roleLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#006834" />
      </View>
    );
  }
  // Dual-role users with no active choice yet pick their experience.
  if (!activeRole) {
    if (isDualRole) return <Redirect href="/role-switch" />;
    // Single-role fallback (RoleProvider normally sets this for us).
    return <Redirect href="/(app)/route-list" />;
  }
  return activeRole === 'sales'
    ? <Redirect href="/(sales)/home" />
    : <Redirect href="/(app)/route-list" />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff' },
});
