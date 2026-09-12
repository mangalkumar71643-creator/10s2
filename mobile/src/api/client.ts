import AsyncStorage from "@react-native-async-storage/async-storage";

// Point this at your backend. For a physical device / emulator, replace
// localhost with your machine's LAN IP (e.g. http://192.168.1.20:4000).
export const API_BASE_URL = "http://localhost:4000";

const TOKEN_KEY = "novaplay_token";

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setToken(token: string | null): Promise<void> {
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export class ApiClientError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const body = res.status !== 204 ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    throw new ApiClientError(res.status, body?.error ?? "Request failed");
  }
  return body as T;
}
