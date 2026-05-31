import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type ListItem = { id: string; name: string; sort_order: number; avatar_url?: string | null };

export async function uploadPersonAvatar(personId: string, file: File): Promise<string | null> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${personId}-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from("member-avatars").upload(path, file, {
    cacheControl: "3600",
    upsert: true,
    contentType: file.type,
  });
  if (upErr) { toast.error(`Upload failed: ${upErr.message}`); return null; }
  const { data } = supabase.storage.from("member-avatars").getPublicUrl(path);
  const url = data.publicUrl;
  const { error: updErr } = await supabase.from("dashboard_persons").update({ avatar_url: url }).eq("id", personId);
  if (updErr) { toast.error(`Save failed: ${updErr.message}`); return null; }
  toast.success("ছবি আপডেট হয়েছে");
  return url;
}

export async function removePersonAvatar(personId: string): Promise<boolean> {
  const { error } = await supabase.from("dashboard_persons").update({ avatar_url: null }).eq("id", personId);
  if (error) { toast.error(`Remove failed: ${error.message}`); return false; }
  toast.success("ছবি মুছে ফেলা হয়েছে");
  return true;
}

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
