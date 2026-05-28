import { useEffect, useState } from "react";
import { Cloud, CloudOff, RefreshCw, CheckCircle2, X } from "lucide-react";
import { flushQueue, queueCount, subscribeQueue, clearQueue } from "@/lib/offline-queue";
import { toast } from "sonner";

export function OfflineIndicator() {
  const [mounted, setMounted] = useState(false);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setMounted(true);
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    setPending(queueCount());
    const unsub = subscribeQueue(() => setPending(queueCount()));
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      unsub();
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const handleSync = async () => {
    if (!online) {
      toast.error("Internet connection নেই — online হলে auto sync হবে।");
      return;
    }
    setSyncing(true);
    try {
      const res = await flushQueue();
      if (res.pushed > 0) toast.success(`${res.pushed}টি entry sync হয়েছে`);
      if (res.failed > 0) toast.warning(`${res.failed}টি sync হয়নি`);
      if (res.pushed === 0 && res.failed === 0 && res.remaining === 0) {
        toast.message("Sync করার মতো কিছু নেই");
      }
    } finally {
      setSyncing(false);
    }
  };

  // Hide during SSR/before mount, and when fully online & nothing pending
  if (!mounted) return null;
  if (online && pending === 0 && !syncing) return null;

  const cls = !online
    ? "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300"
    : pending > 0
      ? "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-200"
      : "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300";

  return (
    <div className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${cls}`}>
      <button
        onClick={handleSync}
        title={
          !online
            ? "Offline — data local এ save হচ্ছে"
            : pending > 0
              ? "Pending entries sync করতে ক্লিক করুন"
              : "Synced"
        }
        className="inline-flex items-center gap-1.5"
      >
        {syncing ? (
          <RefreshCw className="size-3 animate-spin" />
        ) : !online ? (
          <CloudOff className="size-3" />
        ) : pending > 0 ? (
          <Cloud className="size-3" />
        ) : (
          <CheckCircle2 className="size-3" />
        )}
        {!online
          ? `Offline${pending ? ` · ${pending}` : ""}`
          : pending > 0
            ? `${pending} pending`
            : "Synced"}
      </button>
      {online && pending > 0 && !syncing && (
        <button
          onClick={() => {
            clearQueue();
            toast.message("Pending queue clear করা হলো");
          }}
          title="Pending queue clear করুন"
          className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}
