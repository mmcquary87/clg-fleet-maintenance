import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Fetches the logged-in user's own profiles row (id, full_name, role).
export function useProfile(userId) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase.from("profiles").select("id, full_name, role").eq("id", userId).single()
      .then(({ data }) => {
        if (cancelled) return;
        setProfile(data ?? null);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [userId]);

  return { profile, loading, isAdmin: profile?.role === "admin" };
}
