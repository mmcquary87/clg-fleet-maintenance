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
    supabase.from("profiles").select("id, full_name, role, can_edit_roster, can_void_work_orders").eq("id", userId).single()
      .then(({ data }) => {
        if (cancelled) return;
        setProfile(data ?? null);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [userId]);

  const isAdmin = profile?.role === "admin";
  return {
    profile, loading, isAdmin,
    canEditRoster: isAdmin || !!profile?.can_edit_roster,
    canVoidWorkOrders: isAdmin || !!profile?.can_void_work_orders,
  };
}
