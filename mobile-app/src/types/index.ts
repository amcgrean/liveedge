// Shared auth types
export interface User {
  id: string;
  username?: string;
  email: string;
  name: string;
  role?: 'admin' | 'driver' | 'warehouse' | 'supervisor';
  roles?: string[];
  branch?: string;
  branchId?: number;
  permissions?: Record<string, boolean>;
}

export interface AuthSession {
  user: User;
  token: string;
  expiresAt: number; // ms since epoch
}

// Dispatch domain types
export interface DeliveryStop {
  so_number: string;
  customer_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  status: 'pending' | 'delivered' | 'skipped';
  updated_at: string;
  notes?: string;
}

export interface Route {
  id: number;
  route_date: string; // YYYY-MM-DD
  route_name: string;
  driver_name: string;
  branch_code: string;
  status: 'pending' | 'in_progress' | 'completed';
  stops: DeliveryStop[];
}

export interface DeliveryUpdate {
  status: 'delivered' | 'skipped';
  notes?: string;
  timestamp: string;
  photo_count: number;
}

export interface PhotoMetadata {
  id: string;
  so_number: string;
  localPath: string;
  uploaded: boolean;
  createdAt: number;
}

// Local state
export interface PendingDelivery {
  id: string;
  so_number: string;
  status: 'delivered' | 'skipped';
  notes?: string;
  photos: PhotoMetadata[];
  createdAt: number;
  syncedAt?: number;
  error?: string;
}
