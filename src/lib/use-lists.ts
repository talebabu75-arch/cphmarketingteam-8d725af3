import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type ListItem = { id: string; name: string; sort_order: number };

export function useDashboardLists() {
  const [persons, setPersons] = useState<ListItem[]>([]);
  const [locations, setLocations] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [p, l] = await Promise.all([
      supabase.from("dashboard_persons").select("*").order("sort_order").order("name"),
      supabase.from("dashboard_locations").select("*").order("sort_order").order("name"),
    ]);
    if (p.error) toast.error(p.error.message);
    if (l.error) toast.error(l.error.message);
    setPersons((p.data as ListItem[]) ?? []);
    setLocations((l.data as ListItem[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { persons, locations, loading, refresh };
}

export async function addItem(
  table: "dashboard_persons" | "dashboard_locations",
  name: string,
): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed) {
    toast.error("নাম খালি রাখা যাবে না");
    return false;
  }
  const { error } = await supabase
    .from(table)
    .insert({ name: trimmed, sort_order: 999 })
    .select()
    .single();
  if (error) {
    toast.error(`Add failed: ${error.message}`);
    return false;
  }
  toast.success("Added");
  return true;
}

export async function removeItem(table: "dashboard_persons" | "dashboard_locations", id: string) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) toast.error(`Remove failed: ${error.message}`);
  else toast.success("Removed");
}
