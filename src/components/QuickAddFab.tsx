import { useState } from "react";
import { Plus, UserPlus, MapPin, FileText, X, Shield, ClipboardList, Activity } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useUserRole } from "@/hooks/useUserRole";
import { addItem } from "@/lib/use-lists";
import { toast } from "sonner";

export function QuickAddFab() {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<null | "person" | "location">(null);
  const [value, setValue] = useState("");
  const { isAdmin, isManager, loading } = useUserRole();
  const navigate = useNavigate();

  if (loading) return null;

  const submit = async () => {
    if (!value.trim() || !dialog) return;
    await addItem(dialog === "person" ? "dashboard_persons" : "dashboard_locations", value);
    setValue("");
    setDialog(null);
    setOpen(false);
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/20 z-40 animate-in fade-in"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Menu */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        {open && (
          <div className="flex flex-col items-end gap-2 animate-in slide-in-from-bottom-2">
            {isManager && (
              <FabItem
                icon={<UserPlus className="size-4" />}
                label="Add Person"
                onClick={() => { setDialog("person"); setOpen(false); }}
              />
            )}
            {isManager && (
              <FabItem
                icon={<MapPin className="size-4" />}
                label="Add Location"
                onClick={() => { setDialog("location"); setOpen(false); }}
              />
            )}
            <FabItem
              icon={<FileText className="size-4" />}
              label="Open Reports"
              onClick={() => { navigate({ to: "/reports" }); setOpen(false); }}
            />
            {isManager && (
              <FabItem
                icon={<ClipboardList className="size-4" />}
                label="Approvals"
                onClick={() => { navigate({ to: "/admin/approvals" }); setOpen(false); }}
              />
            )}
            {isManager && (
              <FabItem
                icon={<Activity className="size-4" />}
                label="Activity Log"
                onClick={() => { navigate({ to: "/admin/activity" }); setOpen(false); }}
              />
            )}
            {isAdmin && (
              <FabItem
                icon={<Shield className="size-4" />}
                label="Manage Users"
                onClick={() => { navigate({ to: "/admin/users" }); setOpen(false); }}
              />
            )}
            {!isManager && (
              <div className="rounded-md bg-card border px-3 py-2 text-xs text-muted-foreground shadow">
                Staff role — view only
              </div>
            )}
          </div>
        )}

        <button
          aria-label="Quick Add"
          onClick={() => setOpen((v) => !v)}
          className="size-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition grid place-items-center"
        >
          {open ? <X className="size-6" /> : <Plus className="size-6" />}
        </button>
      </div>

      {/* Add dialog */}
      {dialog && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="bg-card border rounded-xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <div>
              <h3 className="font-semibold">
                {dialog === "person" ? "Add Person" : "Add Location"}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                নতুন {dialog === "person" ? "পার্সন" : "লোকেশন"} যোগ করুন
              </p>
            </div>
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") { setDialog(null); setValue(""); }
              }}
              placeholder={dialog === "person" ? "Name…" : "Location name…"}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setDialog(null); setValue(""); }}
                className="px-3 py-1.5 text-sm rounded-md border hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!value.trim()}
                className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FabItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-full bg-card border shadow px-4 py-2 text-sm hover:bg-accent transition"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
