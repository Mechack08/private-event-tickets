"use client";

import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Shows a Google sign-in button when the user is not authenticated.
 * Shows the user's name/email + a sign-out button when authenticated.
 * Designed to sit in the navigation bar alongside WalletConnect.
 */
export function AuthButton() {
  const { user, signIn, signOut } = useAuth();

  if (user) {
    const label = user.name ?? user.email ?? "Signed in";
    return (
      <div className="flex items-center gap-1.5">
        <span className="hidden sm:block text-[11px] text-zinc-400 max-w-[120px] truncate">
          {label}
        </span>
        <button
          onClick={signOut}
          className="text-[11px] text-zinc-500 hover:text-red-400 px-2.5 py-1 border border-white/8 hover:border-red-500/30 transition-colors duration-150 cursor-pointer leading-none rounded-sm"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <GoogleLogin
      onSuccess={(res) => {
        if (res.credential) signIn(res.credential).catch(console.error);
      }}
      onError={() => console.error("Google login failed")}
      size="small"
      theme="filled_black"
      shape="rectangular"
      text="signin_with"
    />
  );
}
