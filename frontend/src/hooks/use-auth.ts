import { useQuery } from "@tanstack/react-query";
import { useAuth as useClerkAuth, useUser } from "@clerk/clerk-react";

import { api } from "@/lib/api";

export type User = {
  id: string;
  clerkId: string;
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

export function useLocalUser() {
  const { isSignedIn } = useClerkAuth();
  return useQuery({
    queryKey: ["auth", "session"],
    queryFn: () => api.get<{ data: User }>("/api/auth/session").then((result) => result.data),
    enabled: Boolean(isSignedIn),
    staleTime: 60_000,
  });
}

export function useAuth() {
  const { isSignedIn, isLoaded } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const localUser = useLocalUser();
  const fallbackUser: User | null = isSignedIn && clerkUser ? {
    id: "",
    clerkId: clerkUser.id,
    email: clerkUser.primaryEmailAddress?.emailAddress ?? "",
    displayName: clerkUser.fullName ?? clerkUser.firstName ?? "",
    role: "MEMBER",
    status: "ACTIVE",
    avatar: clerkUser.imageUrl,
  } : null;

  return {
    user: localUser.data ?? fallbackUser,
    isLoading: !isLoaded || (Boolean(isSignedIn) && localUser.isLoading),
    isAuthenticated: Boolean(isSignedIn),
    clerkUser,
  };
}
