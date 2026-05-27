export const PERSONS = ["Sahin", "Liakot", "Belayet", "Selim", "Taiyab"] as const;
export type Person = (typeof PERSONS)[number];

export const LOCATIONS = [
  "Cumilla", "Burichang", "Nangolkot", "Laksam", "Feni",
  "Chouddagram", "Kotbari", "Barura", "Sonagazi", "Kasba",
  "Muradnogor", "Gunabati", "Miabazar", "B Para",
  "Debidwer", "Chandina", "Mudafforgonj", "Mohammad Ali",
];

export const STATUSES = ["Yes", "No", "D.off", "L.off", "Off day"] as const;
export type Status = (typeof STATUSES)[number];

export const SLOTS = [
  { key: "slot_10", label: "10 AM" },
  { key: "slot_11", label: "11 AM" },
  { key: "slot_14", label: "2 PM" },
] as const;

export type SlotKey = (typeof SLOTS)[number]["key"];

export function statusClass(s: string | null | undefined) {
  switch (s) {
    case "Yes": return "bg-status-yes text-status-yes-foreground";
    case "No": return "bg-status-no text-status-no-foreground";
    case "D.off": return "bg-status-doff text-status-doff-foreground";
    case "L.off": return "bg-status-loff text-status-loff-foreground";
    case "Off day": return "bg-status-off text-status-off-foreground";
    default: return "bg-card text-foreground";
  }
}
