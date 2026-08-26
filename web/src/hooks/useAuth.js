import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export function useAuth() {
  const [session, setSession] = useState(undefined); // undefined = not checked yet, null = signed out
  // Supabase puts an invite/recovery link's type param in the URL hash
  // (e.g. #access_token=...&type=invite). Capture it before anything else
  // consumes/clears the hash, so we know to show "set your password"
  // instead of the normal login form.
  const [authFlowType] = useState(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    return params.get("type"); // "invite" | "recovery" | null
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  return { session, loading: session === undefined, authFlowType };
}
