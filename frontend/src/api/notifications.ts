import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

export interface NotificationResponse {
  id: string;
  user_id: string | null;
  type: string | null;
  title: string | null;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  items: NotificationResponse[];
  total: number;
  unread_count: number;
}

export function useNotifications() {
  const queryClient = useQueryClient();

  const query = useQuery<NotificationListResponse>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data } = await api.get<NotificationListResponse>("/notifications/");
      return data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/notifications/${id}/read`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await api.post("/notifications/read-all");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return {
    data: query.data ?? { items: [], total: 0, unread_count: 0 },
    isLoading: query.isLoading,
    markAsRead: (id: string) => markAsReadMutation.mutate(id),
    markAllRead: () => markAllReadMutation.mutate(),
  };
}
