import { prisma } from "../lib/prisma.js";
import { type as projectType, Status as projectStatus } from "@prisma/client";
import { getTenantFilter } from "../middleware/auth.middleware.js";

const PROJECT_TYPES = Object.values(projectType);
const PROJECT_STATUSES = Object.values(projectStatus);

const cleanText = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
};

const parseDate = (value, label) => {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { ok: false, message: `${label} is not a valid date.` };
  return { ok: true, value: date };
};

const parseEnum = (value, allowed, label) => {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  const normalized = String(value).toUpperCase();
  if (!allowed.includes(normalized)) {
    return { ok: false, message: `${label} must be one of: ${allowed.join(", ")}.` };
  }
  return { ok: true, value: normalized };
};

const uniqueIds = (value) => {
  if (!Array.isArray(value)) return null;
  const ids = [...new Set(value.map((id) => String(id || "")).filter(Boolean))];
  return ids.length && ids.length <= 500 ? ids : null;
};

const projectInclude = {
  _count: {
    select: {
      contacts: { where: { contact_deleted_at: null } },
      opportunities: true,
    },
  },
};

// GET /api/projects/enums
export const getProjectEnums = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        types: PROJECT_TYPES,
        statuses: PROJECT_STATUSES,
      },
    });
  } catch (error) {
    console.error("Error fetching project enums:", error);
    res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
};

// GET /api/projects
export const getProjects = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const take = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * take;
    const { search = "", status, type, from, to } = req.query;

    const tenant = getTenantFilter(req);
    const where = { project_deleted_at: null, ...tenant };

    if (search) {
      where.OR = [
        { project_name: { contains: String(search) } },
        { project_location: { contains: String(search) } },
      ];
    }

    if (status) {
      const parsed = parseEnum(status, PROJECT_STATUSES, "Status filter");
      if (!parsed.ok) return res.status(400).json({ success: false, message: parsed.message });
      where.project_is_active = parsed.value;
    }
    if (type) {
      const parsed = parseEnum(type, PROJECT_TYPES, "Type filter");
      if (!parsed.ok) return res.status(400).json({ success: false, message: parsed.message });
      where.project_type = parsed.value;
    }

    if (from || to) {
      where.project_date = {};
      if (from) {
        const parsed = parseDate(from, "From date filter");
        if (!parsed.ok) return res.status(400).json({ success: false, message: parsed.message });
        where.project_date.gte = parsed.value;
      }
      if (to) {
        const parsed = parseDate(to, "To date filter");
        if (!parsed.ok) return res.status(400).json({ success: false, message: parsed.message });
        where.project_date.lte = parsed.value;
      }
    }

    const [projects, totalRecords, statusGroups, contactsLinked, opportunitiesLinked] = await Promise.all([
      prisma.project.findMany({
        where,
        skip,
        take,
        orderBy: { project_updated_at: "desc" },
        include: projectInclude,
      }),
      prisma.project.count({ where }),
      prisma.project.groupBy({
        by: ["project_is_active"],
        where: { project_deleted_at: null, ...tenant },
        _count: { _all: true },
      }),
      prisma.contact.count({ where: { contact_project_fk: { not: null }, contact_deleted_at: null, ...tenant } }),
      prisma.opportunity.count({ where: { opportunity_project_id: { not: null }, ...tenant } }),
    ]);

    const byStatus = Object.fromEntries(PROJECT_STATUSES.map((value) => [value, 0]));
    for (const row of statusGroups) {
      if (row.project_is_active) byStatus[row.project_is_active] = row._count._all;
    }

    res.status(200).json({
      success: true,
      data: projects,
      pagination: {
        totalRecords,
        currentPage: page,
        totalPages: Math.ceil(totalRecords / take),
      },
      summary: {
        total: statusGroups.reduce((sum, row) => sum + row._count._all, 0),
        byStatus,
        contactsLinked,
        opportunitiesLinked,
      },
    });
  } catch (error) {
    console.error("Error fetching projects:", error);
    res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
};

// GET /api/projects/:id
export const getProjectById = async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { project_id: req.params.id, project_deleted_at: null, ...getTenantFilter(req) },
      include: {
        _count: projectInclude._count,
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
      },
    });

    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found" });
    }

    res.status(200).json({ success: true, data: project });
  } catch (error) {
    console.error("Error fetching project:", error);
    res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
};

// POST /api/projects
export const createProject = async (req, res) => {
  try {
    const location = cleanText(req.body.project_location);
    if (!location) {
      return res.status(400).json({ success: false, message: "Location is required" });
    }

    const type = parseEnum(req.body.project_type, PROJECT_TYPES, "Project type");
    if (!type.ok) return res.status(400).json({ success: false, message: type.message });
    const status = parseEnum(req.body.project_is_active, PROJECT_STATUSES, "Status");
    if (!status.ok) return res.status(400).json({ success: false, message: status.message });
    const date = parseDate(req.body.project_date, "Project date");
    if (!date.ok) return res.status(400).json({ success: false, message: date.message });

    // Resolve tenant: client users always use their own tenant; superadmin may specify one
    let tenantId = req.user.tenantFk;
    if (req.user.role === "SUPER_ADMIN" && req.body.tenant_fk) {
      tenantId = req.body.tenant_fk;
    }
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "No tenant context. Client users are auto-assigned; superadmin must provide tenant_fk.",
      });
    }

    const dataToSave = {
      tenant_fk: tenantId,
      project_location: location,
      project_name: cleanText(req.body.project_name),
      project_type: type.value,
      project_is_active: status.value,
      project_date: date.value,
    };

    const newProject = await prisma.project.create({
      data: dataToSave,
      include: projectInclude,
    });

    res.status(201).json({ success: true, message: "Project created", data: newProject });
  } catch (error) {
    console.error("Error creating project:", error);
    res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
};

// PUT /api/projects/:id
export const updateProject = async (req, res) => {
  try {
    const existing = await prisma.project.findFirst({
      where: { project_id: req.params.id, project_deleted_at: null, ...getTenantFilter(req) },
      select: { project_id: true },
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Project not found" });
    }

    const dataToSave = {};

    if (req.body.project_name !== undefined) dataToSave.project_name = cleanText(req.body.project_name);
    if (req.body.project_location !== undefined) {
      const location = cleanText(req.body.project_location);
      if (!location) {
        return res.status(400).json({ success: false, message: "Location is required" });
      }
      dataToSave.project_location = location;
    }
    if (req.body.project_type !== undefined) {
      const type = parseEnum(req.body.project_type, PROJECT_TYPES, "Project type");
      if (!type.ok) return res.status(400).json({ success: false, message: type.message });
      dataToSave.project_type = type.value;
    }
    if (req.body.project_is_active !== undefined) {
      const status = parseEnum(req.body.project_is_active, PROJECT_STATUSES, "Status");
      if (!status.ok) return res.status(400).json({ success: false, message: status.message });
      dataToSave.project_is_active = status.value;
    }
    if (req.body.project_date !== undefined) {
      const date = parseDate(req.body.project_date, "Project date");
      if (!date.ok) return res.status(400).json({ success: false, message: date.message });
      dataToSave.project_date = date.value;
    }

    if (Object.keys(dataToSave).length === 0) {
      return res.status(400).json({ success: false, message: "Nothing to update." });
    }

    const updatedProject = await prisma.project.update({
      where: { project_id: existing.project_id },
      data: dataToSave,
      include: projectInclude,
    });

    res.status(200).json({ success: true, message: "Project updated", data: updatedProject });
  } catch (error) {
    console.error("Error updating project:", error);
    res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
};

// DELETE /api/projects
export const deleteProjects = async (req, res) => {
  try {
    const ids = uniqueIds(req.body?.ids);
    if (!ids) {
      return res.status(400).json({ success: false, message: "Please provide an array of project IDs" });
    }

    const tenant = getTenantFilter(req);

    // Project links are detached; contacts and opportunities are kept.
    const [, , deleted] = await prisma.$transaction([
      prisma.contact.updateMany({
        where: { contact_project_fk: { in: ids }, ...tenant },
        data: { contact_project_fk: null },
      }),
      prisma.opportunity.updateMany({
        where: { opportunity_project_id: { in: ids }, ...tenant },
        data: { opportunity_project_id: null },
      }),
      prisma.project.updateMany({
        where: { project_id: { in: ids }, ...tenant },
        data: { project_deleted_at: new Date() },
      }),
    ]);

    res.status(200).json({ success: true, message: `${deleted.count} projects deleted successfully` });
  } catch (error) {
    console.error("Error deleting projects:", error);
    res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
};

const findProject = (req) =>
  prisma.project.findFirst({
    where: { project_id: req.params.id, project_deleted_at: null, ...getTenantFilter(req) },
    select: { project_id: true, tenant_fk: true },
  });

// POST /api/projects/:id/contacts
export const linkContacts = async (req, res) => {
  try {
    const project = await findProject(req);
    if (!project) return res.status(404).json({ success: false, message: "Project not found" });

    const ids = uniqueIds(req.body?.contact_ids);
    if (!ids) {
      return res.status(400).json({ success: false, message: "contact_ids must be a non-empty list of up to 500 ids." });
    }

    const contacts = await prisma.contact.findMany({
      where: { contact_id: { in: ids }, tenant_fk: project.tenant_fk, contact_deleted_at: null },
      select: { contact_id: true },
    });
    if (contacts.length !== ids.length) {
      return res.status(400).json({ success: false, message: "Some contacts do not belong to this organization." });
    }

    const result = await prisma.contact.updateMany({
      where: { contact_id: { in: ids }, contact_project_fk: null, contact_deleted_at: null },
      data: { contact_project_fk: project.project_id },
    });

    res.status(200).json({
      success: true,
      message: "Contacts linked",
      data: { linked: result.count, skipped: ids.length - result.count },
    });
  } catch (error) {
    console.error("Error linking project contacts:", error);
    res.status(500).json({ success: false, message: "Failed to link contacts" });
  }
};

// DELETE /api/projects/:id/contacts/:contactId
export const unlinkContact = async (req, res) => {
  try {
    const project = await findProject(req);
    if (!project) return res.status(404).json({ success: false, message: "Project not found" });

    const result = await prisma.contact.updateMany({
      where: {
        contact_id: req.params.contactId,
        contact_project_fk: project.project_id,
        tenant_fk: project.tenant_fk,
      },
      data: { contact_project_fk: null },
    });
    if (!result.count) {
      return res.status(404).json({ success: false, message: "Contact is not linked to this project" });
    }

    res.status(200).json({ success: true, message: "Contact removed from project" });
  } catch (error) {
    console.error("Error unlinking project contact:", error);
    res.status(500).json({ success: false, message: "Failed to remove contact" });
  }
};

// POST /api/projects/:id/opportunities
export const linkOpportunities = async (req, res) => {
  try {
    const project = await findProject(req);
    if (!project) return res.status(404).json({ success: false, message: "Project not found" });

    const ids = uniqueIds(req.body?.opportunity_ids);
    if (!ids) {
      return res.status(400).json({ success: false, message: "opportunity_ids must be a non-empty list of up to 500 ids." });
    }

    const opportunities = await prisma.opportunity.findMany({
      where: { opportunity_id: { in: ids }, tenant_fk: project.tenant_fk },
      select: { opportunity_id: true },
    });
    if (opportunities.length !== ids.length) {
      return res.status(400).json({ success: false, message: "Some opportunities do not belong to this organization." });
    }

    const result = await prisma.opportunity.updateMany({
      where: { opportunity_id: { in: ids }, opportunity_project_id: null },
      data: { opportunity_project_id: project.project_id },
    });

    res.status(200).json({
      success: true,
      message: "Opportunities linked",
      data: { linked: result.count, skipped: ids.length - result.count },
    });
  } catch (error) {
    console.error("Error linking project opportunities:", error);
    res.status(500).json({ success: false, message: "Failed to link opportunities" });
  }
};

// DELETE /api/projects/:id/opportunities/:opportunityId
export const unlinkOpportunity = async (req, res) => {
  try {
    const project = await findProject(req);
    if (!project) return res.status(404).json({ success: false, message: "Project not found" });

    const result = await prisma.opportunity.updateMany({
      where: {
        opportunity_id: req.params.opportunityId,
        opportunity_project_id: project.project_id,
        tenant_fk: project.tenant_fk,
      },
      data: { opportunity_project_id: null },
    });
    if (!result.count) {
      return res.status(404).json({ success: false, message: "Opportunity is not linked to this project" });
    }

    res.status(200).json({ success: true, message: "Opportunity removed from project" });
  } catch (error) {
    console.error("Error unlinking project opportunity:", error);
    res.status(500).json({ success: false, message: "Failed to remove opportunity" });
  }
};
