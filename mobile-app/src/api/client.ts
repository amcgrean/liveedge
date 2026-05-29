import axios, { AxiosInstance } from 'axios';

const API_TIMEOUT = parseInt(process.env.EXPO_API_TIMEOUT || '30000', 10);
const BACKEND_URL = process.env.EXPO_BACKEND_URL || 'http://localhost:3000';

// Create axios instance with base config
const client: AxiosInstance = axios.create({
  baseURL: BACKEND_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor to include auth token
client.interceptors.request.use(async (config) => {
  // Token will be added by caller or auth context if available
  return config;
});

// Add response interceptor for error handling
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Unauthorized - clear session and redirect to login
      // This is handled by auth context in app
    }
    return Promise.reject(error);
  }
);

export default client;
