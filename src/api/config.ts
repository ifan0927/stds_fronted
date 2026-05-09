const DEFAULT_API_BASE_URL = '/api/v1';

export function getApiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL;
}
