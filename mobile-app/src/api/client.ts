import axios, { AxiosInstance } from 'axios';

// IMPORTANT: Expo only inlines env vars prefixed with EXPO_PUBLIC_* into the
// client bundle. EXPO_BACKEND_URL would always be undefined in device builds.
// Document: set EXPO_PUBLIC_BACKEND_URL in mobile-app/.env (e.g.
// https://app.beisser.cloud) for production. Leave it unset to use dev-mode
// mocks (see src/api/auth.ts).
const API_TIMEOUT = parseInt(process.env.EXPO_PUBLIC_API_TIMEOUT || '30000', 10);
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const client: AxiosInstance = axios.create({
  baseURL: BACKEND_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Token will be attached by callers via headers; nothing to do here yet.
client.interceptors.request.use(async (config) => config);

client.interceptors.response.use(
  (response) => response,
  (error) => {
    // 401 handling lives in the auth context (clears session + redirects).
    return Promise.reject(error);
  }
);

export const IS_DEV_MODE = !BACKEND_URL;
export default client;
