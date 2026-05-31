import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';

// The two role-gated experiences that live inside this single app binary.
// Driver = field / offline-first / POD. Sales = lookups + quote/order creation.
export type AppRole = 'sales' | 'driver';

const ACTIVE_ROLE_KEY = 'active_role';

/**
 * Which experiences is this user entitled to?
 *
 * Source of truth is the JWT `roles[]` (and `permissions`) the web side
 * returns from /api/auth/mobile/verify-otp. Until that wiring lands
 * (Phase 5 on the web), dev/mock sessions expose BOTH so the role
 * switcher is exercisable.
 *
 * Web capability mapping (see CLAUDE.md access-control):
 *   - `sales.view`    → sales experience
 *   - `dispatch.view` → driver experience
 */
export function availableRoles(user: {
  roles?: string[];
  permissions?: Record<string, boolean>;
} | null): AppRole[] {
  if (!user) return [];
  const roles = (user.roles || []).map((r) => r.toLowerCase());
  const perms = user.permissions || {};

  const canSales =
    roles.some((r) => ['sales', 'estimator', 'commercial_estimator', 'admin'].includes(r)) ||
    perms['sales.view'] === true;
  const canDriver =
    roles.some((r) => ['driver', 'dispatch', 'admin'].includes(r)) ||
    perms['dispatch.view'] === true;

  const out: AppRole[] = [];
  if (canSales) out.push('sales');
  if (canDriver) out.push('driver');

  // Dev / mock sessions (no roles resolved yet) get both so the
  // architecture is demonstrable end-to-end before the backend lands.
  if (out.length === 0) return ['sales', 'driver'];
  return out;
}

interface RoleContextType {
  /** Roles the signed-in user is entitled to. */
  roles: AppRole[];
  /** The experience currently active (persisted across launches). */
  activeRole: AppRole | null;
  /** True while the persisted choice is being restored. */
  isLoading: boolean;
  /** True when the user can use both experiences (shows the switcher). */
  isDualRole: boolean;
  setActiveRole: (role: AppRole) => Promise<void>;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {
  const { user, isSignedIn } = useAuth();
  const roles = availableRoles(user);
  const [activeRole, setActiveRoleState] = useState<AppRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const saved = (await AsyncStorage.getItem(ACTIVE_ROLE_KEY)) as AppRole | null;
        if (saved && roles.includes(saved)) {
          setActiveRoleState(saved);
        } else if (roles.length === 1) {
          // Single-role user: no choice to make.
          setActiveRoleState(roles[0]);
        }
      } catch {
        // ignore — falls through to the role switcher
      } finally {
        setIsLoading(false);
      }
    })();
    // Re-evaluate whenever the signed-in identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, user?.id]);

  const setActiveRole = async (role: AppRole) => {
    setActiveRoleState(role);
    try {
      await AsyncStorage.setItem(ACTIVE_ROLE_KEY, role);
    } catch {
      // best-effort persistence
    }
  };

  const value: RoleContextType = {
    roles,
    activeRole,
    isLoading,
    isDualRole: roles.length > 1,
    setActiveRole,
  };

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (ctx === undefined) {
    throw new Error('useRole must be used within RoleProvider');
  }
  return ctx;
}
