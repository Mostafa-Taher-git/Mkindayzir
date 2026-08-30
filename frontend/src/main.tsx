import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { Providers } from "@/components/shared/providers";
import App from "@/App";
import { setClerkTokenGetter } from "@/lib/api";
import "@/app/globals.css";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!clerkPublishableKey) {
  throw new Error("VITE_CLERK_PUBLISHABLE_KEY must be configured");
}

function ClerkTokenBridge() {
  const { getToken } = useAuth();
  React.useEffect(() => {
    setClerkTokenGetter(getToken);
  }, [getToken]);
  return null;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
      afterSignOutUrl="/"
    >
      <ClerkTokenBridge />
      <BrowserRouter>
        <Providers>
          <App />
        </Providers>
      </BrowserRouter>
    </ClerkProvider>
  </React.StrictMode>
);
