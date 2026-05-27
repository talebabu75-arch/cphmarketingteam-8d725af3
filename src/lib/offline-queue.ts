import { supabase } from "@/integrations/supabase/client";

/** A queued monitoring_entries upsert that couldn't reach the server. */
export type QueuedEntry = {
  id: string; // local uuid
  queued_at: number;
  payload: {
    entry_date: string;
    person: string;
    location: string | null;
    slot_10: string | null;
    slot_11: string | null;
    slot_14: string | null;
  };
};

const KEY = "monitoring_offline_queue_v1";
const listeners = new Set<() => void>();

function read(): QueuedEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedEntry[]) : [];
  } catch {
    return [];
  }
}

function write(items: QueuedEntry[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(items));
  listeners.forEach((l) => l());
}

export function getQueue(): QueuedEntry[] {
  return read();
}

export function queueCount(): number {
  return read().length;
}

export function subscribeQueue(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Enqueue (or replace existing entry for same date|person key). */
export function enqueue(payload: QueuedEntry["payload"]) {
  const items = read();
  const key = `${payload.entry_date}|${payload.person}`;
  const filtered = items.filter(
    (i) => `${i.payload.entry_date}|${i.payload.person}` !== key,
  );
  filtered.push({
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    queued_at: Date.now(),
    payload,
  });
  write(filtered);
}

let flushing = false;

/** Try to push everything in the queue to Supabase. Returns counts. */
export async function flushQueue(): Promise<{
  pushed: number;
  failed: number;
  remaining: number;
}> {
  if (flushing) return { pushed: 0, failed: 0, remaining: read().length };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { pushed: 0, failed: 0, remaining: read().length };
  }
  flushing = true;
  try {
    const items = read();
    if (items.length === 0) return { pushed: 0, failed: 0, remaining: 0 };

    // Verify auth — without a session the upsert will fail anyway.
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) {
      return { pushed: 0, failed: 0, remaining: items.length };
    }

    const remaining: QueuedEntry[] = [];
    let pushed = 0;
    let failed = 0;
    for (const item of items) {
      const { error } = await supabase
        .from("monitoring_entries")
        .upsert(item.payload, { onConflict: "entry_date,person" });
      if (error) {
        failed += 1;
        remaining.push(item);
      } else {
        pushed += 1;
      }
    }
    write(remaining);
    return { pushed, failed, remaining: remaining.length };
  } finally {
    flushing = false;
  }
}

/** Wire up window online/offline + periodic flush. Call once at app root. */
export function startOfflineSync() {
  if (typeof window === "undefined") return () => {};
  const onOnline = () => {
    void flushQueue();
  };
  window.addEventListener("online", onOnline);
  const interval = window.setInterval(() => {
    if (navigator.onLine && read().length > 0) void flushQueue();
  }, 15000);
  // Initial attempt
  if (navigator.onLine) void flushQueue();
  return () => {
    window.removeEventListener("online", onOnline);
    window.clearInterval(interval);
  };
}
