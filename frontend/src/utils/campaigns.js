import { currentOrgRole } from "./modules";

export const CAMPAIGN_TYPES = [
  { value: "EMAIL", label: "Email" },
  { value: "SOCIAL_MEDIA", label: "Social media" },
  { value: "WEBINAR", label: "Webinar" },
  { value: "EVENT", label: "Event" },
  { value: "ADVERTISEMENT", label: "Advertisement" },
  { value: "PHONE_OUTREACH", label: "Phone outreach" },
  { value: "DIRECT_MARKETING", label: "Direct marketing" },
  { value: "REFERRAL", label: "Referral" },
  { value: "OTHER", label: "Other" },
];

export const CAMPAIGN_STATUSES = [
  { value: "DRAFT", label: "Draft" },
  { value: "PLANNED", label: "Planned" },
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export const CAMPAIGN_PRIORITIES = [
  { value: "HIGH", label: "High" },
  { value: "NORMAL", label: "Medium" },
  { value: "LOW", label: "Low" },
];

export const CAMPAIGN_STATUS_STYLES = {
  DRAFT: "bg-slate-100 text-slate-600 border-slate-200",
  PLANNED: "bg-blue-50 text-blue-700 border-blue-100",
  ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-100",
  PAUSED: "bg-amber-50 text-amber-700 border-amber-100",
  COMPLETED: "bg-vsph-grey text-vsph-navy border-slate-200",
  CANCELLED: "bg-rose-50 text-rose-700 border-rose-100",
};

const labelOf = (list, value) => list.find((item) => item.value === value)?.label || "—";

export const typeLabel = (value) => labelOf(CAMPAIGN_TYPES, value);
export const statusLabel = (value) => labelOf(CAMPAIGN_STATUSES, value);
export const priorityLabel = (value) => labelOf(CAMPAIGN_PRIORITIES, value);

export const money = (value) => {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  return Number.isFinite(amount)
    ? amount.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : "—";
};

export const dateOnly = (value) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";

export const isCampaignManager = () =>
  ["ORG_SUPER_ADMIN", "ORG_ADMIN", "PLATFORM_SUPERADMIN"].includes(currentOrgRole());
