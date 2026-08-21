"use client";

import { useState, useEffect } from "react";

type User = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  avatar?: string;
  timezone?: string;
  locale?: string;
  aiProvider?: string;
  aiModel?: string;
};

type UseAuthReturn = {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
};

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchSession() {
      try {
        const res = await fetch("/api/auth/session");
        if (res.ok) {
          const data = await res.json();
          setUser(data.data);
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchSession();
  }, []);

  return { user, isLoading, isAuthenticated: !!user };
}
