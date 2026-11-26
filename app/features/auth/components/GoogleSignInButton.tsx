import { useEffect, useRef } from "react";

const SCRIPT_URL = "https://accounts.google.com/gsi/client";

/** The Web OAuth client; without it there is no Google button. */
export const googleWebClientId: string | undefined = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID;

type GoogleAccounts = {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: { credential?: string }) => void;
        ux_mode?: "popup";
      }) => void;
      renderButton: (parent: HTMLElement, options: Record<string, string | number>) => void;
    };
  };
};

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- extends the browser's Window
  interface Window {
    google?: GoogleAccounts;
  }
}

let scriptLoading: Promise<GoogleAccounts> | null = null;

/** Google Identity Services, loaded once on first use. */
function loadGoogle(): Promise<GoogleAccounts> {
  if (window.google) return Promise.resolve(window.google);

  scriptLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.google ? resolve(window.google) : reject(new Error("No Google")));
    script.onerror = () => {
      scriptLoading = null;
      reject(new Error("Google sign-in could not load"));
    };
    document.head.appendChild(script);
  });
  return scriptLoading;
}

type GoogleSignInButtonProps = {
  /** Google's ID token of the account the user picked. */
  onCredential: (idToken: string) => void;
  onError: () => void;
};

/**
 * Google's own "Sign in with Google" button (its look is Google's rule). It gives an ID token
 * straight away, which the backend checks; nothing from Google is kept here.
 */
export function GoogleSignInButton({ onCredential, onError }: GoogleSignInButtonProps) {
  const container = useRef<HTMLDivElement>(null);
  // The latest handlers, without drawing the button again when they change.
  const handlers = useRef({ onCredential, onError });
  useEffect(() => {
    handlers.current = { onCredential, onError };
  });

  useEffect(() => {
    const clientId = googleWebClientId;
    if (!clientId) return;
    let cancelled = false;

    loadGoogle()
      .then((google) => {
        if (cancelled || !container.current) return;
        google.accounts.id.initialize({
          client_id: clientId,
          ux_mode: "popup",
          callback: (response) => {
            if (response.credential) handlers.current.onCredential(response.credential);
            else handlers.current.onError();
          },
        });
        google.accounts.id.renderButton(container.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "pill",
          width: container.current.offsetWidth || 320,
        });
      })
      .catch(() => {
        if (!cancelled) handlers.current.onError();
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!googleWebClientId) return null;
  // Google draws the button inside an iframe whose document is light. When the iframe's
  // color-scheme differs from the page's (dark theme), the browser paints an opaque white
  // backdrop behind it; matching it to light keeps the iframe transparent.
  return (
    <div
      ref={container}
      className="flex w-full justify-center [color-scheme:light]"
      data-testid="google-sign-in"
    />
  );
}
