import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Admin-only: lists every user (via the list-users edge function, since
// profiles has no email and auth.users isn't reachable under RLS) and lets
// an admin toggle a user's roster-edit permission.
export function useUsersAdmin() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke("list-users");
    if (fnError) {
      setError(fnError.message);
      setUsers([]);
    } else if (data?.error) {
      setError(data.error);
      setUsers([]);
    } else {
      setUsers(data.users ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setCanEditRoster = async (userId, canEditRoster) => {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, can_edit_roster: canEditRoster } : u)));
    const { data, error: fnError } = await supabase.functions.invoke("update-user-permissions", {
      body: { userId, canEditRoster },
    });
    if (fnError || data?.error) {
      await load(); // revert to server state on failure
      return fnError?.message || data?.error;
    }
    return null;
  };

  const setCanVoidWorkOrders = async (userId, canVoidWorkOrders) => {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, can_void_work_orders: canVoidWorkOrders } : u)));
    const { data, error: fnError } = await supabase.functions.invoke("update-user-permissions", {
      body: { userId, canVoidWorkOrders },
    });
    if (fnError || data?.error) {
      await load(); // revert to server state on failure
      return fnError?.message || data?.error;
    }
    return null;
  };

  return { users, loading, error, reload: load, setCanEditRoster, setCanVoidWorkOrders };
}
