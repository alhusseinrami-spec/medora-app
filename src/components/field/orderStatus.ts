export const ORDER_STATUS = {
  SUBMITTED: { label: "Waiting for accounting", chip: "chip-warn", text: "text-warn" },
  APPROVED: { label: "Approved", chip: "chip-ok", text: "text-ok" },
  REJECTED: { label: "Rejected", chip: "chip-danger", text: "text-danger" },
  CANCELLED: { label: "Cancelled", chip: "", text: "text-muted" },
} as const;
