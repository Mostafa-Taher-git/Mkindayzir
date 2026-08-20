import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

type SocketEvent = {
  type: string;
  data: unknown;
};

type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

export function useSocket(sessionId: string | null) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [events, setEvents] = useState<SocketEvent[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");

  useEffect(() => {
    if (!sessionId) return;

    const socket = io({
      path: "/api/socket.io",
      auth: { sessionId },
    });

    socket.on("connect", () => {
      setConnected(true);
      setReconnecting(false);
      setStatus("connected");
    });

    socket.on("disconnect", () => {
      setConnected(false);
      setReconnecting(false);
      setStatus("disconnected");
    });

    socket.on("connect_error", () => {
      setReconnecting(true);
      setStatus("reconnecting");
    });

    socket.on("reconnect_attempt", () => {
      setReconnecting(true);
      setStatus("reconnecting");
    });

    socket.onAny((event, data) => {
      setEvents((prev) => [...prev, { type: event, data }]);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
      setReconnecting(false);
      setStatus("disconnected");
    };
  }, [sessionId]);

  const join = (entityType: string, entityId: string, userId: string) => {
    socketRef.current?.emit("join", { entityType, entityId, userId });
  };

  const leave = (entityType: string, entityId: string, userId: string) => {
    socketRef.current?.emit("leave", { entityType, entityId, userId });
  };

  const clearEvents = () => setEvents([]);

  const onAny = (callback: (event: string, data: unknown) => void) => {
    const socket = socketRef.current;
    if (!socket) return () => {};
    socket.onAny((event, data) => callback(event, data));
    return () => {
      socket.offAny(callback as (...args: unknown[]) => void);
    };
  };

  return { connected, reconnecting, status, events, join, leave, clearEvents, onAny, socket: socketRef.current };
}
