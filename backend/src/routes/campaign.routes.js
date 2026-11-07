import express from "express";
import {
  getCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  getCampaignById,
  getCampaignMeta,
  getCampaignTasks,
  linkContacts,
  unlinkContact,
  linkOpportunities,
  unlinkOpportunity,
} from "../controllers/campaign.controller.js";
import { requirePermission } from "../middleware/auth.middleware.js";

const router = express.Router();
const view = requirePermission("CAMPAIGNS", "VIEW");
const create = requirePermission("CAMPAIGNS", "CREATE");
const edit = requirePermission("CAMPAIGNS", "EDIT");
const remove = requirePermission("CAMPAIGNS", "DELETE");

router.get("/", view, getCampaigns);
router.get("/meta", view, getCampaignMeta);
router.post("/", create, createCampaign);
router.get("/:id", view, getCampaignById);
router.put("/:id", edit, updateCampaign);
router.delete("/:id", remove, deleteCampaign);
router.get("/:id/tasks", view, getCampaignTasks);

// Audience and attribution relationships share the campaign edit permission.
router.post("/:id/contacts", edit, linkContacts);
router.delete("/:id/contacts/:contactId", edit, unlinkContact);
router.post("/:id/opportunities", edit, linkOpportunities);
router.delete("/:id/opportunities/:opportunityId", edit, unlinkOpportunity);

export default router;
