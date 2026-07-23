import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { showBrowserNotification } from "../utils/browserNotifications";

const MAX_RETRIES = 5;
const PING_INTERVAL = 30_000;

/** Событие realtime-шины, ретранслированное с бэкенда через WebSocket. */
interface RealtimeEvent {
  type: string;
  data?: {
    id?: string;
    channel?: string;
    notif_type?: string;
    title?: string;
    body?: string;
    link?: string;
    [k: string]: unknown;
  };
}

export function useWebSocket(token: string | null) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  const cleanup = useCallback(() => {
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const send = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  const handleEvent = useCallback(
    (event: RealtimeEvent) => {
      const data = event.data ?? {};
      switch (event.type) {
        case "new_communication": {
          // Обновляем счётчик непрочитанных, колокольчик и списки чатов/заявок.
          queryClient.invalidateQueries({ queryKey: ["unread-chats-count"] });
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
          queryClient.invalidateQueries({ queryKey: ["communications"] });
          if (data.id) {
            queryClient.invalidateQueries({ queryKey: ["comm_messages", data.id] });
          }
          // Браузерный пуш о новом сообщении / заявке.
          if (data.title) {
            showBrowserNotification({
              title: data.title,
              body: data.body,
              link: data.link,
              tag: data.link || data.id,
            });
          }
          break;
        }
        case "new_notification": {
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
          if (data.title) {
            showBrowserNotification({
              title: data.title,
              body: data.body,
              link: data.link,
              tag: data.link,
            });
          }
          break;
        }
        case "communication_updated": {
          queryClient.invalidateQueries({ queryKey: ["communications"] });
          if (data.id) {
            queryClient.invalidateQueries({ queryKey: ["comm_messages", data.id] });
          }
          break;
        }
        case "schedule_updated": {
          queryClient.invalidateQueries({ queryKey: ["schedule"] });
          break;
        }
        default:
          break;
      }
    },
    [queryClient],
  );

  useEffect(() => {
    if (!token) return;

    function connect() {
      cleanup();

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      const url = `${protocol}//${host}/api/v1/ws?token=${encodeURIComponent(token!)}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        retriesRef.current = 0;

        // Keepalive ping
        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send("ping");
          }
        }, PING_INTERVAL);
      };

      ws.onmessage = (event) => {
        // Ignore pong text responses
        if (event.data === "pong") return;

        try {
          const message = JSON.parse(event.data) as RealtimeEvent;
          if (message.type) handleEvent(message);
        } catch {
          // Non-JSON message, ignore
        }
      };

      ws.onclose = () => {
        setConnected(false);
        cleanup();

        // Exponential backoff reconnect
        if (retriesRef.current < MAX_RETRIES) {
          const delay = Math.min(1000 * 2 ** retriesRef.current, 30_000);
          retriesRef.current += 1;
          reconnectTimerRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      cleanup();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
    };
  }, [token, handleEvent, cleanup]);

  return { connected, send };
}
