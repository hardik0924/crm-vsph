export const PROJECT_STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
];

export const PROJECT_STATUS_STYLES = {
  ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-100",
  INACTIVE: "bg-rose-50 text-rose-700 border-rose-100",
};

export const PROJECT_TYPES = [
  { value: "INBOUND", label: "Inbound" },
  { value: "OUTBOUND", label: "Outbound" },
];

const prettify = (value) =>
  value ? value.replace(/_/g, " ").toLowerCase().replace(/^./, (char) => char.toUpperCase()) : "-";

export const projectStatusLabel = (value) =>
  PROJECT_STATUSES.find((item) => item.value === value)?.label || prettify(value);

export const projectTypeLabel = (value) =>
  PROJECT_TYPES.find((item) => item.value === value)?.label || prettify(value);

export const dateOnly = (value) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "-";
