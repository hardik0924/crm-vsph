import { prisma } from "../lib/prisma.js";
import { getTenantFilter } from "../middleware/auth.middleware.js";
import { isEmployee, isOrgAdmin } from "../lib/roles.js";

export const CAMPAIGN_TYPES = [
  "EMAIL",
  "SOCIAL_MEDIA",
  "WEBINAR",
  "EVENT",
  "ADVERTISEMENT",
  "PHONE_OUTREACH",
  "DIRECT_MARKETING",
  "REFERRAL",
  "OTHER",
];

export const CAMPAIGN_STATUSES = ["DRAFT", "PLANNED", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"];
export const CAMPAIGN_PRIORITIES = ["NORMAL", "HIGH", "LOW"];
const MAX_MONEY = 9999999999999999.99;

const cleanText = (value, max) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
};

const parseDate = (value, label) => {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { ok: false, message: `${label} is not a valid date.` };
  return { ok: true, value: date };
};

const parseMoney = (value, label) => {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  const amount = Number(value);
  if (!Number.isFinite(amount)) return { ok: false, message: `${label} must be a number.` };
  if (amount < 0) return { ok: false, message: `${label} cannot be negative.` };
  if (amount > MAX_MONEY) return { ok: false, message: `${label} is too large.` };
  return { ok: true, value: Math.round(amount * 100) / 100 };
};

const parseCount = (value, label) => {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    return { ok: false, message: `${label} must be a whole number of zero or more.` };
  }
  return { ok: true, value: number };
};

const parseEnum = (value, allowed, label) => {
  const normalized = String(value || "").toUpperCase();
  if (!allowed.includes(normalized)) {
    return { ok: false, message: `${label} must be one of: ${allowed.join(", ")}.` };
  }
  return { ok: true, value: normalized };
};

const resolveTenantId = (req) => {
  if (req.user.role === "SUPER_ADMIN") return req.body.tenant_fk || req.user.tenantFk || null;
  return req.user.tenantFk;
};

const normalizeCode = (value) => {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  const code = String(value).trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,40}$/.test(code)) {
    return {
      ok: false,
      message: "Campaign code must be 2-40 characters using letters, numbers, hyphens or underscores.",
    };
  }
  return { ok: true, value: code };
};

/**
 * Builds validated campaign data. `existing` is supplied for partial updates so
 * untouched values are preserved and date order is checked against them.
 */
const buildCampaignData = async (body, existing, { tenantId, userId, isManager }) => {
  const data = {};
  const has = (key) => body[key] !== undefined;

  if (has("campaign_name")) {
    const name = cleanText(body.campaign_name, 191);
    if (!name) return { ok: false, message: "Campaign name is required." };
    data.campaign_name = name;
  } else if (!existing) {
    return { ok: false, message: "Campaign name is required." };
  }

  if (has("campaign_code")) {
    const code = normalizeCode(body.campaign_code);
    if (!code.ok) return code;
    if (code.value) {
      const duplicate = await prisma.campaign.findFirst({
        where: {
          tenant_fk: tenantId,
          campaign_code: code.value,
          campaign_deleted_at: null,
          ...(existing ? { campaign_id: { not: existing.campaign_id } } : {}),
        },
        select: { campaign_id: true },
      });
      if (duplicate) return { ok: false, message: "That campaign code is already used in your organization." };
    }
    data.campaign_code = code.value;
  }

  for (const [field, allowed, label] of [
    ["campaign_type", CAMPAIGN_TYPES, "Campaign type"],
    ["campaign_status", CAMPAIGN_STATUSES, "Status"],
    ["campaign_priority", CAMPAIGN_PRIORITIES, "Priority"],
  ]) {
    if (!has(field)) continue;
    if (body[field] === null || body[field] === "") {
      if (field === "campaign_status" || field === "campaign_priority") {
        return { ok: false, message: `${label} is required.` };
      }
      data[field] = null;
      continue;
    }
    const parsed = parseEnum(body[field], allowed, label);
    if (!parsed.ok) return parsed;
    data[field] = parsed.value;
  }

  if (has("campaign_objective")) data.campaign_objective = cleanText(body.campaign_objective, 1000);
  if (has("campaign_description")) data.campaign_description = cleanText(body.campaign_description, 5000);

  const dates = {};
  for (const [field, label] of [
    ["campaign_start_date", "Start date"],
    ["campaign_end_date", "End date"],
    ["campaign_launch_date", "Launch date"],
  ]) {
    if (!has(field)) continue;
    const parsed = parseDate(body[field], label);
    if (!parsed.ok) return parsed;
    dates[field] = parsed.value;
    data[field] = parsed.value;
  }

  const start = dates.campaign_start_date !== undefined ? dates.campaign_start_date : existing?.campaign_start_date;
  const end = dates.campaign_end_date !== undefined ? dates.campaign_end_date : existing?.campaign_end_date;
  if (start && end && end < start) {
    return { ok: false, message: "End date cannot be earlier than the start date." };
  }

  const effectiveStatus = data.campaign_status ?? existing?.campaign_status;
  if (["ACTIVE", "COMPLETED"].includes(effectiveStatus) && !start) {
    return { ok: false, message: "Add a start date before marking a campaign active or completed." };
  }

  for (const [field, label] of [
    ["campaign_planned_budget", "Planned budget"],
    ["campaign_actual_cost", "Actual cost"],
    ["campaign_expected_revenue", "Expected revenue"],
  ]) {
    if (!has(field)) continue;
    if (!isManager) {
      return { ok: false, message: "Only organization administrators can set budget, cost or revenue." };
    }
    const parsed = parseMoney(body[field], label);
    if (!parsed.ok) return parsed;
    data[field] = parsed.value;
  }

  for (const [field, label] of [
    ["campaign_target_contacts", "Target contacts"],
    ["campaign_target_leads", "Target leads"],
    ["campaign_target_opportunities", "Target opportunities"],
  ]) {
    if (!has(field)) continue;
    const parsed = parseCount(body[field], label);
    if (!parsed.ok) return parsed;
    data[field] = parsed.value;
  }

  if (has("campaign_user_fk")) {
    const ownerId = body.campaign_user_fk || null;
    if (ownerId) {
      if (!isManager && ownerId !== userId) {
        return { ok: false, message: "Only organization administrators can assign another owner." };
      }
      const owner = await prisma.user.findFirst({
        where: { user_id: ownerId, tenant_fk: tenantId, user_deleted_at: null },
        select: { user_id: true },
      });
      if (!owner) return { ok: false, message: "The owner does not belong to this organization." };
      data.campaign_user_fk = ownerId;
    } else if (isManager) {
      data.campaign_user_fk = null;
    }
  }

  return { ok: true, data };
};

const campaignListInclude = {
  user: { select: { user_name: true } },
  _count: {
    select: {
      contacts: { where: { contact_deleted_at: null } },
      opportunities: true,
      tasks: { where: { task_deleted_at: null } },
    },
  },
};

export const getCampaigns = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const take = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * take;
    const { search = "", status, type, owner, from, to } = req.query;

    const tenant = getTenantFilter(req);
    const where = { campaign_deleted_at: null, ...tenant };

    if (search) {
      where.OR = [
        { campaign_name: { contains: String(search) } },
        { campaign_code: { contains: String(search) } },
      ];
    }

    if (status) {
      const parsed = parseEnum(status, CAMPAIGN_STATUSES, "Status filter");
      if (!parsed.ok) return res.status(400).json({ success: false, message: parsed.message });
      where.campaign_status = parsed.value;
    }
    if (type) {
      const parsed = parseEnum(type, CAMPAIGN_TYPES, "Type filter");
      if (!parsed.ok) return res.status(400).json({ success: false, message: parsed.message });
      where.campaign_type = parsed.value;
    }
    if (owner) where.campaign_user_fk = String(owner);

    if (from || to) {
      where.campaign_start_date = {};
      if (from) {
        const parsed = parseDate(from, "Start date filter");
        if (!parsed.ok) return res.status(400).json({ success: false, message: parsed.message });
        where.campaign_start_date.gte = parsed.value;
      }
      if (to) {
        const parsed = parseDate(to, "End date filter");
        if (!parsed.ok) return res.status(400).json({ success: false, message: parsed.message });
        where.campaign_start_date.lte = parsed.value;
      }
    }

    const [campaigns, totalRecords, statusGroups, budget] = await Promise.all([
      prisma.campaign.findMany({
        where,
        skip,
        take,
        orderBy: { campaign_updated_at: "desc" },
        include: campaignListInclude,
      }),
      prisma.campaign.count({ where }),
      prisma.campaign.groupBy({
        by: ["campaign_status"],
        where: { campaign_deleted_at: null, ...tenant },
        _count: { _all: true },
      }),
      prisma.campaign.aggregate({
        where: { campaign_deleted_at: null, ...tenant },
        _sum: { campaign_planned_budget: true, campaign_actual_cost: true },
      }),
    ]);

    const byStatus = Object.fromEntries(CAMPAIGN_STATUSES.map((value) => [value, 0]));
    for (const row of statusGroups) {
      if (row.campaign_status) byStatus[row.campaign_status] = row._count._all;
    }

    res.status(200).json({
      success: true,
      data: campaigns,
      pagination: {
        totalRecords,
        currentPage: page,
        totalPages: Math.ceil(totalRecords / take),
      },
      summary: {
        total: Object.values(byStatus).reduce((sum, value) => sum + value, 0),
        byStatus,
        plannedBudget: budget._sum.campaign_planned_budget,
        actualCost: budget._sum.campaign_actual_cost,
      },
    });
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    res.status(500).json({ success: false, message: "Failed to fetch campaigns" });
  }
};

export const getCampaignById = async (req, res) => {
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { campaign_id: req.params.id, campaign_deleted_at: null, ...getTenantFilter(req) },
      include: {
        user: { select: { user_id: true, user_name: true } },
        created_by: { select: { user_id: true, user_name: true } },
        contacts: {
          where: { contact_deleted_at: null },
          select: {
            contact_id: true,
            contact_firstname: true,
            contact_lastname: true,
            contact_professional_email: true,
            contact_call_status: true,
            account: { select: { account_name: true } },
          },
          orderBy: { contact_created_at: "desc" },
        },
        opportunities: {
          select: {
            opportunity_id: true,
            opportunity_name: true,
            opportunity_stage: true,
            opportunity_close_date: true,
            opportunity_owner: { select: { user_name: true } },
          },
          orderBy: { opportunity_created_at: "desc" },
        },
        tasks: {
          where: {
            task_deleted_at: null,
            // Employees only ever see their own tasks, on every surface.
            ...(isEmployee(req.user) ? { task_user_fk: req.user.id } : {}),
          },
          select: {
            task_id: true,
            task_subject: true,
            task_status: true,
            task_priority: true,
            task_due_date: true,
            user: { select: { user_name: true } },
          },
          orderBy: { task_created_at: "desc" },
        },
      },
    });

    if (!campaign) {
      return res.status(404).json({ success: false, message: "Campaign not found" });
    }

    const wonOpportunities = campaign.opportunities.filter(
      (opportunity) => opportunity.opportunity_stage === "CLOSED_WON"
    ).length;
    const linkedOpportunities = campaign.opportunities.length;

    res.status(200).json({
      success: true,
      data: {
        ...campaign,
        performance: {
          contactsTargeted: campaign.contacts.length,
          opportunitiesLinked: linkedOpportunities,
          opportunitiesWon: wonOpportunities,
          // No lead model exists yet, so leads are a target only.
          leadsTracked: false,
          // Opportunities have no value column, so revenue cannot be summed.
          revenueTracked: false,
          conversionRate:
            linkedOpportunities > 0 ? Math.round((wonOpportunities / linkedOpportunities) * 100) : null,
        },
        accountsReached: [
          ...new Set(
            campaign.contacts.map((contact) => contact.account?.account_name).filter(Boolean)
          ),
        ],
      },
    });
  } catch (error) {
    console.error("Error fetching campaign:", error);
    res.status(500).json({ success: false, message: "Failed to fetch campaign" });
  }
};

export const createCampaign = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "No tenant context. Client users are auto-assigned; superadmin must provide tenant_fk.",
      });
    }

    const built = await buildCampaignData(req.body, null, {
      tenantId,
      userId: req.user.id,
      isManager: isOrgAdmin(req.user),
    });
    if (!built.ok) return res.status(400).json({ success: false, message: built.message });

    const campaign = await prisma.campaign.create({
      data: {
        tenant_fk: tenantId,
        campaign_user_fk: built.data.campaign_user_fk || req.user.id,
        campaign_created_by_fk: req.user.id,
        ...built.data,
      },
      include: campaignListInclude,
    });

    res.status(201).json({ success: true, message: "Campaign created", data: campaign });
  } catch (error) {
    console.error("Error creating campaign:", error);
    res.status(500).json({ success: false, message: "Failed to create campaign" });
  }
};

export const updateCampaign = async (req, res) => {
  try {
    const existing = await prisma.campaign.findFirst({
      where: { campaign_id: req.params.id, campaign_deleted_at: null, ...getTenantFilter(req) },
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Campaign not found" });
    }

    const built = await buildCampaignData(req.body, existing, {
      tenantId: existing.tenant_fk,
      userId: req.user.id,
      isManager: isOrgAdmin(req.user),
    });
    if (!built.ok) return res.status(400).json({ success: false, message: built.message });
    if (Object.keys(built.data).length === 0) {
      return res.status(400).json({ success: false, message: "Nothing to update." });
    }

    const campaign = await prisma.campaign.update({
      where: { campaign_id: existing.campaign_id },
      data: built.data,
      include: campaignListInclude,
    });

    res.status(200).json({ success: true, message: "Campaign updated", data: campaign });
  } catch (error) {
    console.error("Error updating campaign:", error);
    res.status(500).json({ success: false, message: "Failed to update campaign" });
  }
};

export const deleteCampaign = async (req, res) => {
  try {
    const existing = await prisma.campaign.findFirst({
      where: { campaign_id: req.params.id, campaign_deleted_at: null, ...getTenantFilter(req) },
      select: { campaign_id: true },
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Campaign not found" });
    }

    // Campaign links are detached; contacts, opportunities and tasks are kept.
    await prisma.$transaction([
      prisma.contact.updateMany({
        where: { contact_campaign_fk: existing.campaign_id },
        data: { contact_campaign_fk: null },
      }),
      prisma.opportunity.updateMany({
        where: { opportunity_campaign_id: existing.campaign_id },
        data: { opportunity_campaign_id: null },
      }),
      prisma.task.updateMany({
        where: { task_campaign_fk: existing.campaign_id },
        data: { task_campaign_fk: null },
      }),
      prisma.campaign.update({
        where: { campaign_id: existing.campaign_id },
        data: { campaign_deleted_at: new Date() },
      }),
    ]);

    res.status(200).json({ success: true, message: "Campaign deleted" });
  } catch (error) {
    console.error("Error deleting campaign:", error);
    res.status(500).json({ success: false, message: "Failed to delete campaign" });
  }
};

const findCampaign = (req) =>
  prisma.campaign.findFirst({
    where: { campaign_id: req.params.id, campaign_deleted_at: null, ...getTenantFilter(req) },
    select: { campaign_id: true, tenant_fk: true },
  });

const uniqueIds = (value) => {
  if (!Array.isArray(value)) return null;
  const ids = [...new Set(value.map((id) => String(id || "")).filter(Boolean))];
  return ids.length && ids.length <= 500 ? ids : null;
};

export const linkContacts = async (req, res) => {
  try {
    const campaign = await findCampaign(req);
    if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found" });

    const ids = uniqueIds(req.body?.contact_ids);
    if (!ids) {
      return res.status(400).json({ success: false, message: "contact_ids must be a non-empty list of up to 500 ids." });
    }

    const contacts = await prisma.contact.findMany({
      where: { contact_id: { in: ids }, tenant_fk: campaign.tenant_fk, contact_deleted_at: null },
      select: { contact_id: true },
    });
    if (contacts.length !== ids.length) {
      return res.status(400).json({ success: false, message: "Some contacts do not belong to this organization." });
    }

    const result = await prisma.contact.updateMany({
      where: { contact_id: { in: ids }, contact_campaign_fk: null },
      data: { contact_campaign_fk: campaign.campaign_id },
    });

    res.status(200).json({
      success: true,
      message: "Contacts linked",
      data: { linked: result.count, skipped: ids.length - result.count },
    });
  } catch (error) {
    console.error("Error linking campaign contacts:", error);
    res.status(500).json({ success: false, message: "Failed to link contacts" });
  }
};

export const unlinkContact = async (req, res) => {
  try {
    const campaign = await findCampaign(req);
    if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found" });

    const result = await prisma.contact.updateMany({
      where: {
        contact_id: req.params.contactId,
        contact_campaign_fk: campaign.campaign_id,
        tenant_fk: campaign.tenant_fk,
      },
      data: { contact_campaign_fk: null },
    });
    if (!result.count) {
      return res.status(404).json({ success: false, message: "Contact is not linked to this campaign" });
    }

    res.status(200).json({ success: true, message: "Contact removed from campaign" });
  } catch (error) {
    console.error("Error unlinking campaign contact:", error);
    res.status(500).json({ success: false, message: "Failed to remove contact" });
  }
};

export const linkOpportunities = async (req, res) => {
  try {
    const campaign = await findCampaign(req);
    if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found" });

    const ids = uniqueIds(req.body?.opportunity_ids);
    if (!ids) {
      return res.status(400).json({ success: false, message: "opportunity_ids must be a non-empty list of up to 500 ids." });
    }

    const opportunities = await prisma.opportunity.findMany({
      where: { opportunity_id: { in: ids }, tenant_fk: campaign.tenant_fk },
      select: { opportunity_id: true },
    });
    if (opportunities.length !== ids.length) {
      return res.status(400).json({ success: false, message: "Some opportunities do not belong to this organization." });
    }

    const result = await prisma.opportunity.updateMany({
      where: { opportunity_id: { in: ids }, opportunity_campaign_id: null },
      data: { opportunity_campaign_id: campaign.campaign_id },
    });

    res.status(200).json({
      success: true,
      message: "Opportunities linked",
      data: { linked: result.count, skipped: ids.length - result.count },
    });
  } catch (error) {
    console.error("Error linking campaign opportunities:", error);
    res.status(500).json({ success: false, message: "Failed to link opportunities" });
  }
};

export const unlinkOpportunity = async (req, res) => {
  try {
    const campaign = await findCampaign(req);
    if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found" });

    const result = await prisma.opportunity.updateMany({
      where: {
        opportunity_id: req.params.opportunityId,
        opportunity_campaign_id: campaign.campaign_id,
        tenant_fk: campaign.tenant_fk,
      },
      data: { opportunity_campaign_id: null },
    });
    if (!result.count) {
      return res.status(404).json({ success: false, message: "Opportunity is not linked to this campaign" });
    }

    res.status(200).json({ success: true, message: "Opportunity removed from campaign" });
  } catch (error) {
    console.error("Error unlinking campaign opportunity:", error);
    res.status(500).json({ success: false, message: "Failed to remove opportunity" });
  }
};

export const getCampaignTasks = async (req, res) => {
  try {
    const campaign = await findCampaign(req);
    if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found" });

    const tasks = await prisma.task.findMany({
      where: {
        task_campaign_fk: campaign.campaign_id,
        task_deleted_at: null,
        ...(isEmployee(req.user) ? { task_user_fk: req.user.id } : {}),
        ...getTenantFilter(req),
      },
      select: {
        task_id: true,
        task_subject: true,
        task_status: true,
        task_priority: true,
        task_due_date: true,
        task_progress: true,
        user: { select: { user_id: true, user_name: true } },
      },
      orderBy: { task_created_at: "desc" },
    });

    res.status(200).json({ success: true, data: tasks });
  } catch (error) {
    console.error("Error fetching campaign tasks:", error);
    res.status(500).json({ success: false, message: "Failed to fetch campaign tasks" });
  }
};

export const getCampaignMeta = (req, res) =>
  res.status(200).json({
    success: true,
    data: {
      types: CAMPAIGN_TYPES,
      statuses: CAMPAIGN_STATUSES,
      priorities: CAMPAIGN_PRIORITIES,
    },
  });
