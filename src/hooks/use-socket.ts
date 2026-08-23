
import { useEffect, useRef, useState } from "react";

type SocketEvent = {
  type: string;
  data: unknown;
};

type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

export function useWebSocket(sessionToken: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [events, setEvents] = useState<SocketEvent[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");

  useEffect(() => {
    if (!sessionToken) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${sessionToken}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setReconnecting(false);
      setStatus("connected");
    };

    ws.onclose = () => {
      setConnected(false);
      setReconnecting(false);
      setStatus("disconnected");
    };

    ws.onerror = () => {
      setReconnecting(true);
      setStatus("reconnecting");
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        setEvents((prev) => [...prev, { type: message.type || message.event || "message", data: message }]);
      } catch {
        // ignore invalid messages
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
      setConnected(false);
      setReconnecting(false);
      setStatus("disconnected");
    };
  }, [sessionToken]);

  const send = (data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  };

  const clearEvents = () => setEvents([]);

  const onAny = (callback: (event: string, data: unknown) => void) => {
    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        callback(message.type || message.event || "message", message);
      } catch {
        // ignore
      }
    };
    wsRef.current?.addEventListener("message", handleMessage);
    return () => {
      wsRef.current?.removeEventListener("message", handleMessage);
    };
  };

  return { connected, reconnecting, status, events, send, clearEvents, onAny, ws: wsRef.current };
}
