import { useState } from "react";
import { addItem, removeItem, type ListItem } from "@/lib/use-lists";

export function ManageListsDialog({
  open, onClose, persons, locations, onChanged,
}: {
  open: boolean;
  onClose: () => void;
  persons: ListItem[];
  locations: ListItem[];
  onChanged: () => void;
}) {
  const [newPerson, setNewPerson] = useState("");
  const [newLocation, setNewLocation] = useState("");

  if (!open) return null;

  async function handleAdd(kind: "person" | "location") {
    if (kind === "person") {
      await addItem("dashboard_persons", newPerson);
      setNewPerson("");
    } else {
      await addItem("dashboard_locations", newLocation);
      setNewLocation("");
    }
    onChanged();
  }

  async function handleRemove(kind: "person" | "location", id: string) {
    await removeItem(kind === "person" ? "dashboard_persons" : "dashboard_locations", id);
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card text-foreground rounded-xl border shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-lg font-semibold">Manage Persons & Locations</h2>
          <button onClick={onClose} className="rounded-md px-2 py-1 hover:bg-accent text-sm">✕</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5 overflow-auto">
          <ListPanel
            title="Persons"
            items={persons}
            inputValue={newPerson}
            onInput={setNewPerson}
            onAdd={() => handleAdd("person")}
            onRemove={(id) => handleRemove("person", id)}
            placeholder="New person name"
          />
          <ListPanel
            title="Locations"
            items={locations}
            inputValue={newLocation}
            onInput={setNewLocation}
            onAdd={() => handleAdd("location")}
            onRemove={(id) => handleRemove("location", id)}
            placeholder="New location name"
          />
        </div>

        <div className="border-t px-5 py-3 flex justify-end">
          <button onClick={onClose} className="rounded-md border bg-primary text-primary-foreground px-4 py-1.5 text-sm hover:opacity-90">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function ListPanel({
  title, items, inputValue, onInput, onAdd, onRemove, placeholder,
}: {
  title: string;
  items: ListItem[];
  inputValue: string;
  onInput: (v: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  placeholder: string;
}) {
  return (
    <div className="rounded-lg border bg-background/40 flex flex-col">
      <div className="px-3 py-2 border-b font-medium text-sm">{title} <span className="text-muted-foreground">({items.length})</span></div>
      <div className="p-3 flex gap-2">
        <input
          value={inputValue}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onAdd(); }}
          placeholder={placeholder}
          className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button onClick={onAdd} className="rounded-md border bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:opacity-90">
          Add
        </button>
      </div>
      <ul className="px-3 pb-3 space-y-1 overflow-auto max-h-[40vh]">
        {items.map((it) => (
          <li key={it.id} className="flex items-center justify-between rounded-md border bg-card px-3 py-1.5 text-sm">
            <span>{it.name}</span>
            <button onClick={() => onRemove(it.id)} className="text-xs text-destructive hover:underline">Remove</button>
          </li>
        ))}
        {items.length === 0 && <li className="text-xs text-muted-foreground text-center py-4">No entries yet</li>}
      </ul>
    </div>
  );
}
