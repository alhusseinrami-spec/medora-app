import south from "@/data/leads/south-pharmacies-2026-10.json";

// Researched lists of places reps can call on. A manager adds one to the pipeline from the Pipeline screen.
export type LeadList = { id: string; title: string; rows: { name: string; placeType: string; phone: string; address: string; notes: string; lat?: number; lng?: number }[] };

export const LEAD_LISTS: LeadList[] = [south];

export const leadList = (id: string) => LEAD_LISTS.find((l) => l.id === id);
