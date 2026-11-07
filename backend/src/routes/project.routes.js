import express from "express";
import {
  getProjects,
  createProject,
  updateProject,
  deleteProjects,
  getProjectEnums,
  getProjectById,
  linkContacts,
  unlinkContact,
  linkOpportunities,
  unlinkOpportunity,
} from "../controllers/project.controller.js";
import { requirePermission } from "../middleware/auth.middleware.js";

const router = express.Router();
const view = requirePermission("PROJECTS", "VIEW");
const create = requirePermission("PROJECTS", "CREATE");
const edit = requirePermission("PROJECTS", "EDIT");
const remove = requirePermission("PROJECTS", "DELETE");

router.get("/enums", view, getProjectEnums);
router.get("/", view, getProjects);
router.post("/", create, createProject);
router.get("/:id", view, getProjectById);
router.put("/:id", edit, updateProject);
router.post("/delete", remove, deleteProjects);

// Contact and opportunity relationships share the project edit permission.
router.post("/:id/contacts", edit, linkContacts);
router.delete("/:id/contacts/:contactId", edit, unlinkContact);
router.post("/:id/opportunities", edit, linkOpportunities);
router.delete("/:id/opportunities/:opportunityId", edit, unlinkOpportunity);

export default router;
