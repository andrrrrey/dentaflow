import { create } from "zustand";
import { api } from "../api/client";

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar_url?: string | null;
  is_active: boolean;
  created_at: string;
}

interface AuthState {
  user: UserResponse | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  loadFromStorage: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: localStorage.getItem("access_token"),
  refreshToken: localStorage.getItem("refresh_token"),
  isAuthenticated: false,
  isLoading: true,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post("/auth/login", { email, password });
      const { access_token, refresh_token } = data;

      localStorage.setItem("access_token", access_token);
      localStorage.setItem("refresh_token", refresh_token);

      // Fetch user profile
      const { data: user } = await api.get<UserResponse>("/auth/me", {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      set({
        accessToken: access_token,
        refreshToken: refresh_token,
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Ошибка входа";
      set({ isLoading: false, error: message, isAuthenticated: false });
      throw new Error(message);
    }
  },

  logout: () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  },

  setTokens: (accessToken: string, refreshToken: string) => {
    localStorage.setItem("access_token", accessToken);
    localStorage.setItem("refresh_token", refreshToken);
    set({ accessToken, refreshToken });
  },

  loadFromStorage: async () => {
    const token = get().accessToken ?? localStorage.getItem("access_token");
    if (!token) {
      set({ isLoading: false, isAuthenticated: false });
      return;
    }

    try {
      const { data: user } = await api.get<UserResponse>("/auth/me");
      set({
        user,
        isAuthenticated: true,
        isLoading: false,
        accessToken: localStorage.getItem("access_token"),
        refreshToken: localStorage.getItem("refresh_token"),
      });
    } catch {
      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    }
  },
}));
