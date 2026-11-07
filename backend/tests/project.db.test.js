import test from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/server.js";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/passwords.js";
import { signSessionToken } from "../src/lib/session.js";

const runDbTests = process.env.RUN_DB_TESTS === "1";

process.env.AUTH_TOKEN_SECRET ||= "project-db-test-secret-key-32-chars-min";

test("project management: CRUD, relationships, permissions and tenant isolation", { skip: !runDbTests }, async () => {
  const stamp = Date.now();
  const tenantA = await prisma.tenant.create({
    data: { tenant_name: "Project A", tenant_code: `PA${stamp}`.slice(0, 20), tenant_status: "ACTIVE" },
  });
  const tenantB = await prisma.tenant.create({
    data: { tenant_name: "Project B", tenant_code: `PB${stamp}`.slice(0, 20), tenant_status: "ACTIVE" },
  });
  for (const tenant of [tenantA, tenantB]) {
    await prisma.organization_app_entitlement.create({
      data: {
        tenant_fk: tenant.tenant_id,
        app_code: "CRM",
        entitlement_status: "ACTIVE",
        effective_start: new Date(Date.now() - 86400000),
      },
    });
  }

  const password = await hashPassword("Password123!");
  const adminA = await prisma.user.create({
    data: {
      user_name: "Project Admin",
      user_email: `proj.admin.${stamp}@example.test`,
      user_password: password,
      user_role: "ADMIN",
      user_is_tenant_owner: true,
      tenant_fk: tenantA.tenant_id,
    },
  });
  const editorA = await prisma.user.create({
    data: {
      user_name: "Project Editor",
      user_email: `proj.editor.${stamp}@example.test`,
      user_password: password,
      user_role: "SALES",
      user_module_access: "PROJECTS:VIEW,CREATE,EDIT",
      tenant_fk: tenantA.tenant_id,
    },
  });
  const viewerA = await prisma.user.create({
    data: {
      user_name: "Project Viewer",
      user_email: `proj.viewer.${stamp}@example.test`,
      user_password: password,
      user_role: "SALES",
      user_module_access: "PROJECTS:VIEW",
      tenant_fk: tenantA.tenant_id,
    },
  });
  const adminB = await prisma.user.create({
    data: {
      user_name: "Project Other Admin",
      user_email: `proj.other.${stamp}@example.test`,
      user_password: password,
      user_role: "ADMIN",
      user_is_tenant_owner: true,
      tenant_fk: tenantB.tenant_id,
    },
  });

  const contactA = await prisma.contact.create({
    data: {
      tenant_fk: tenantA.tenant_id,
      contact_code: `PC-${stamp}`,
      contact_firstname: "Project",
      contact_lastname: "Member",
      contact_owner_fk: adminA.user_id,
    },
  });
  const contactA2 = await prisma.contact.create({
    data: {
      tenant_fk: tenantA.tenant_id,
      contact_code: `PD-${stamp}`,
      contact_firstname: "Second",
      contact_lastname: "Member",
      contact_owner_fk: adminA.user_id,
    },
  });
  const contactB = await prisma.contact.create({
    data: {
      tenant_fk: tenantB.tenant_id,
      contact_code: `PE-${stamp}`,
      contact_firstname: "Foreign",
      contact_lastname: "Contact",
      contact_owner_fk: adminB.user_id,
    },
  });
  const opportunityA = await prisma.opportunity.create({
    data: {
      tenant_fk: tenantA.tenant_id,
      opportunity_owner_fk: adminA.user_id,
      opportunity_name: "Project deal",
      opportunity_close_date: new Date(),
      opportunity_stage: "FOLLOW_UP",
    },
  });
  const opportunityB = await prisma.opportunity.create({
    data: {
      tenant_fk: tenantB.tenant_id,
      opportunity_owner_fk: adminB.user_id,
      opportunity_name: "Foreign project deal",
      opportunity_close_date: new Date(),
    },
  });

  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (token, method, path, body) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };

  const adminToken = signSessionToken(adminA);
  const editorToken = signSessionToken(editorA);
  const viewerToken = signSessionToken(viewerA);
  const otherToken = signSessionToken(adminB);
  let projectId;

  try {
    // Validation
    assert.equal((await call(adminToken, "POST", "/api/projects", { project_name: "No location" })).status, 400);
    assert.equal(
      (await call(adminToken, "POST", "/api/projects", { project_location: "Pune", project_type: "SIDEWAYS" })).status,
      400
    );
    assert.equal(
      (await call(adminToken, "POST", "/api/projects", {
        project_location: "Pune",
        project_date: "not-a-date",
      })).status,
      400
    );

    // Create
    const created = await call(adminToken, "POST", "/api/projects", {
      project_name: "Warehouse Rollout",
      project_location: "Pune",
      project_type: "INBOUND",
      project_is_active: "ACTIVE",
      project_date: "2026-06-01",
    });
    assert.equal(created.status, 201);
    projectId = created.body.data.project_id;
    assert.equal(created.body.data.project_location, "Pune");

    // Listing, filters, summary
    const list = await call(adminToken, "GET", "/api/projects?search=Warehouse&status=ACTIVE&type=INBOUND");
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);
    assert.ok(list.body.summary.byStatus.ACTIVE >= 1);
    assert.equal(list.body.summary.total >= 1, true);

    // Detail
    const detail = await call(adminToken, "GET", `/api/projects/${projectId}`);
    assert.equal(detail.status, 200);
    assert.deepEqual(detail.body.data.contacts, []);
    assert.deepEqual(detail.body.data.opportunities, []);

    // Update preserves untouched values and refuses an empty location.
    const updated = await call(adminToken, "PUT", `/api/projects/${projectId}`, {
      project_name: "Warehouse Rollout Updated",
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.project_location, "Pune");
    assert.equal(
      (await call(adminToken, "PUT", `/api/projects/${projectId}`, { project_location: "  " })).status,
      400
    );

    // Contacts: link, skip duplicate, cross-tenant rejection, unlink.
    assert.equal(
      (await call(adminToken, "POST", `/api/projects/${projectId}/contacts`, { contact_ids: [contactA.contact_id] }))
        .body.data.linked,
      1
    );
    assert.equal(
      (await call(adminToken, "POST", `/api/projects/${projectId}/contacts`, { contact_ids: [contactA.contact_id] }))
        .body.data.linked,
      0
    );
    assert.equal(
      (await call(adminToken, "POST", `/api/projects/${projectId}/contacts`, { contact_ids: [contactB.contact_id] }))
        .status,
      400
    );

    assert.equal(
      (await call(adminToken, "POST", `/api/projects/${projectId}/contacts`, { contact_ids: [contactA2.contact_id] }))
        .body.data.linked,
      1
    );
    assert.equal(
      (await call(adminToken, "DELETE", `/api/projects/${projectId}/contacts/${contactA2.contact_id}`)).status,
      200
    );
    assert.equal(
      (await prisma.contact.findUnique({ where: { contact_id: contactA2.contact_id } })).contact_project_fk,
      null
    );

    // Opportunities: link and cross-tenant rejection.
    assert.equal(
      (
        await call(adminToken, "POST", `/api/projects/${projectId}/opportunities`, {
          opportunity_ids: [opportunityA.opportunity_id],
        })
      ).body.data.linked,
      1
    );
    assert.equal(
      (
        await call(adminToken, "POST", `/api/projects/${projectId}/opportunities`, {
          opportunity_ids: [opportunityB.opportunity_id],
        })
      ).status,
      400
    );

    const withRelations = await call(adminToken, "GET", `/api/projects/${projectId}`);
    assert.equal(withRelations.body.data.contacts.length, 1);
    assert.equal(withRelations.body.data.opportunities.length, 1);

    // Permissions
    assert.equal((await call(viewerToken, "GET", `/api/projects/${projectId}`)).status, 200);
    assert.equal((await call(viewerToken, "POST", "/api/projects", { project_location: "Delhi" })).status, 403);
    assert.equal(
      (await call(viewerToken, "POST", "/api/projects/delete", { ids: [projectId] })).status,
      403
    );
    assert.equal(
      (await call(editorToken, "POST", "/api/projects", { project_location: "Mumbai" })).status,
      201
    );
    assert.equal(
      (await call(editorToken, "POST", `/api/projects/${projectId}/contacts`, { contact_ids: [contactA2.contact_id] }))
        .status,
      200
    );

    // Tenant isolation
    assert.equal((await call(otherToken, "GET", `/api/projects/${projectId}`)).status, 404);
    assert.equal(
      (await call(otherToken, "PUT", `/api/projects/${projectId}`, { project_name: "Hijack" })).status,
      404
    );
    assert.equal((await call(otherToken, "POST", "/api/projects/delete", { ids: [projectId] })).status, 200);
    assert.equal((await call(adminToken, "GET", `/api/projects/${projectId}`)).status, 200);

    // Delete: soft delete, records preserved, relationships detached.
    assert.equal((await call(adminToken, "POST", "/api/projects/delete", { ids: [projectId] })).status, 200);
    const keptContact = await prisma.contact.findUnique({ where: { contact_id: contactA.contact_id } });
    assert.ok(keptContact);
    assert.equal(keptContact.contact_project_fk, null);
    const keptOpportunity = await prisma.opportunity.findUnique({
      where: { opportunity_id: opportunityA.opportunity_id },
    });
    assert.ok(keptOpportunity);
    assert.equal(keptOpportunity.opportunity_project_id, null);
    assert.equal((await call(adminToken, "GET", `/api/projects/${projectId}`)).status, 404);
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections?.();
    });
    await prisma.contact.deleteMany({ where: { tenant_fk: { in: [tenantA.tenant_id, tenantB.tenant_id] } } });
    await prisma.opportunity.deleteMany({ where: { tenant_fk: { in: [tenantA.tenant_id, tenantB.tenant_id] } } });
    await prisma.project.deleteMany({ where: { tenant_fk: { in: [tenantA.tenant_id, tenantB.tenant_id] } } });
    await prisma.user.deleteMany({ where: { tenant_fk: { in: [tenantA.tenant_id, tenantB.tenant_id] } } });
    await prisma.organization_app_entitlement.deleteMany({
      where: { tenant_fk: { in: [tenantA.tenant_id, tenantB.tenant_id] } },
    });
    await prisma.tenant.deleteMany({ where: { tenant_id: { in: [tenantA.tenant_id, tenantB.tenant_id] } } });
    await prisma.$disconnect();
  }
});
