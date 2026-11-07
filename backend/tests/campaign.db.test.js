import test from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/server.js";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/passwords.js";
import { signSessionToken } from "../src/lib/session.js";

const runDbTests = process.env.RUN_DB_TESTS === "1";

process.env.AUTH_TOKEN_SECRET ||= "campaign-db-test-secret-key-32-chars-min";

test("campaign management: CRUD, relationships, permissions and tenant isolation", { skip: !runDbTests }, async () => {
  const stamp = Date.now();
  const tenantA = await prisma.tenant.create({
    data: { tenant_name: "Campaign A", tenant_code: `CA${stamp}`.slice(0, 20), tenant_status: "ACTIVE" },
  });
  const tenantB = await prisma.tenant.create({
    data: { tenant_name: "Campaign B", tenant_code: `CB${stamp}`.slice(0, 20), tenant_status: "ACTIVE" },
  });
  await prisma.organization_app_entitlement.create({
    data: {
      tenant_fk: tenantA.tenant_id,
      app_code: "CRM",
      entitlement_status: "ACTIVE",
      effective_start: new Date(Date.now() - 86400000),
    },
  });
  await prisma.organization_app_entitlement.create({
    data: {
      tenant_fk: tenantB.tenant_id,
      app_code: "CRM",
      entitlement_status: "ACTIVE",
      effective_start: new Date(Date.now() - 86400000),
    },
  });

  const password = await hashPassword("Password123!");
  const adminA = await prisma.user.create({
    data: {
      user_name: "Campaign Admin",
      user_email: `camp.admin.${stamp}@example.test`,
      user_password: password,
      user_role: "ADMIN",
      user_is_tenant_owner: true,
      tenant_fk: tenantA.tenant_id,
    },
  });
  const editorA = await prisma.user.create({
    data: {
      user_name: "Campaign Editor",
      user_email: `camp.editor.${stamp}@example.test`,
      user_password: password,
      user_role: "SALES",
      user_module_access: "CAMPAIGNS:VIEW,CREATE,EDIT",
      tenant_fk: tenantA.tenant_id,
    },
  });
  const viewerA = await prisma.user.create({
    data: {
      user_name: "Campaign Viewer",
      user_email: `camp.viewer.${stamp}@example.test`,
      user_password: password,
      user_role: "SALES",
      user_module_access: "CAMPAIGNS:VIEW",
      tenant_fk: tenantA.tenant_id,
    },
  });
  const adminB = await prisma.user.create({
    data: {
      user_name: "Other Admin",
      user_email: `camp.other.${stamp}@example.test`,
      user_password: password,
      user_role: "ADMIN",
      user_is_tenant_owner: true,
      tenant_fk: tenantB.tenant_id,
    },
  });

  const contactA = await prisma.contact.create({
    data: {
      tenant_fk: tenantA.tenant_id,
      contact_code: `CC-${stamp}`,
      contact_firstname: "Audience",
      contact_lastname: "Member",
      contact_owner_fk: adminA.user_id,
    },
  });
  const contactB = await prisma.contact.create({
    data: {
      tenant_fk: tenantB.tenant_id,
      contact_code: `CD-${stamp}`,
      contact_firstname: "Foreign",
      contact_lastname: "Contact",
      contact_owner_fk: adminB.user_id,
    },
  });
  const opportunityA = await prisma.opportunity.create({
    data: {
      tenant_fk: tenantA.tenant_id,
      opportunity_owner_fk: adminA.user_id,
      opportunity_name: "Campaign deal",
      opportunity_close_date: new Date(),
      opportunity_stage: "CLOSED_WON",
    },
  });
  const opportunityB = await prisma.opportunity.create({
    data: {
      tenant_fk: tenantB.tenant_id,
      opportunity_owner_fk: adminB.user_id,
      opportunity_name: "Foreign deal",
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
  let campaignId;

  try {
    // Validation
    assert.equal((await call(adminToken, "POST", "/api/campaigns", {})).status, 400);

    const negative = await call(adminToken, "POST", "/api/campaigns", {
      campaign_name: "Bad budget",
      campaign_planned_budget: -5,
    });
    assert.equal(negative.status, 400);

    const badDates = await call(adminToken, "POST", "/api/campaigns", {
      campaign_name: "Bad dates",
      campaign_start_date: "2026-05-10",
      campaign_end_date: "2026-05-01",
    });
    assert.equal(badDates.status, 400);

    const activeNoDate = await call(adminToken, "POST", "/api/campaigns", {
      campaign_name: "Active without a schedule",
      campaign_status: "ACTIVE",
    });
    assert.equal(activeNoDate.status, 400);

    const foreignOwner = await call(adminToken, "POST", "/api/campaigns", {
      campaign_name: "Foreign owner",
      campaign_user_fk: adminB.user_id,
    });
    assert.equal(foreignOwner.status, 400);

    // Create
    const created = await call(adminToken, "POST", "/api/campaigns", {
      campaign_name: "Spring Launch",
      campaign_code: `SUM-${stamp}`.slice(0, 40),
      campaign_type: "EMAIL",
      campaign_status: "PLANNED",
      campaign_priority: "HIGH",
      campaign_objective: "Book demos",
      campaign_start_date: "2026-05-01",
      campaign_end_date: "2026-05-31",
      campaign_planned_budget: 150000,
      campaign_actual_cost: 25000,
      campaign_target_contacts: 100,
      campaign_user_fk: adminA.user_id,
    });
    assert.equal(created.status, 201);
    campaignId = created.body.data.campaign_id;
    assert.equal(created.body.data.campaign_status, "PLANNED");

    // Duplicate code is rejected per tenant.
    const duplicate = await call(adminToken, "POST", "/api/campaigns", {
      campaign_name: "Duplicate code",
      campaign_code: `SUM-${stamp}`.slice(0, 40),
    });
    assert.equal(duplicate.status, 400);

    // Listing, filters and summary
    const list = await call(adminToken, "GET", `/api/campaigns?search=Spring&status=PLANNED&type=EMAIL`);
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.summary.byStatus.PLANNED, 1);
    assert.equal(Number(list.body.summary.plannedBudget), 150000);

    // Detail
    const detail = await call(adminToken, "GET", `/api/campaigns/${campaignId}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.performance.contactsTargeted, 0);
    assert.equal(detail.body.data.performance.conversionRate, null);

    // Update preserves untouched values.
    const updated = await call(adminToken, "PUT", `/api/campaigns/${campaignId}`, {
      campaign_name: "Spring Launch Updated",
      campaign_status: "ACTIVE",
    });
    assert.equal(updated.status, 200);
    assert.equal(Number(updated.body.data.campaign_planned_budget), 150000);

    // Audience: link, duplicate, cross-tenant, unlink.
    assert.equal(
      (await call(adminToken, "POST", `/api/campaigns/${campaignId}/contacts`, { contact_ids: [contactA.contact_id] })).body
        .data.linked,
      1
    );
    assert.equal(
      (await call(adminToken, "POST", `/api/campaigns/${campaignId}/contacts`, { contact_ids: [contactA.contact_id] })).body
        .data.linked,
      0
    );
    assert.equal(
      (await call(adminToken, "POST", `/api/campaigns/${campaignId}/contacts`, { contact_ids: [contactB.contact_id] }))
        .status,
      400
    );
    assert.equal(
      (await call(adminToken, "DELETE", `/api/campaigns/${campaignId}/contacts/${contactA.contact_id}`)).status,
      200
    );
    assert.ok(await prisma.contact.findUnique({ where: { contact_id: contactA.contact_id } }));

    // Opportunity attribution and cross-tenant rejection.
    assert.equal(
      (
        await call(adminToken, "POST", `/api/campaigns/${campaignId}/opportunities`, {
          opportunity_ids: [opportunityA.opportunity_id],
        })
      ).body.data.linked,
      1
    );
    assert.equal(
      (
        await call(adminToken, "POST", `/api/campaigns/${campaignId}/opportunities`, {
          opportunity_ids: [opportunityB.opportunity_id],
        })
      ).status,
      400
    );

    const withOpportunity = await call(adminToken, "GET", `/api/campaigns/${campaignId}`);
    assert.equal(withOpportunity.body.data.performance.opportunitiesLinked, 1);
    assert.equal(withOpportunity.body.data.performance.opportunitiesWon, 1);
    assert.equal(withOpportunity.body.data.performance.conversionRate, 100);

    // Tasks are real CRM tasks linked to the campaign.
    const createdTask = await call(adminToken, "POST", "/api/tasks", {
      task_subject: "Campaign follow up",
      task_campaign_fk: campaignId,
    });
    assert.equal(createdTask.status, 201);
    const withTask = await call(adminToken, "GET", `/api/campaigns/${campaignId}`);
    assert.equal(withTask.body.data.tasks.length, 1);
    assert.equal(withTask.body.data.tasks[0].task_subject, "Campaign follow up");

    const foreignCampaign = await call(otherToken, "POST", "/api/campaigns", { campaign_name: "Other tenant campaign" });
    assert.equal(foreignCampaign.status, 201);
    assert.equal(
      (
        await call(adminToken, "POST", "/api/tasks", {
          task_subject: "Cross tenant task",
          task_campaign_fk: foreignCampaign.body.data.campaign_id,
        })
      ).status,
      400
    );

    // View-only employee can read but not write.
    assert.equal((await call(viewerToken, "GET", `/api/campaigns/${campaignId}`)).status, 200);
    assert.equal((await call(viewerToken, "POST", "/api/campaigns", { campaign_name: "Nope" })).status, 403);
    assert.equal((await call(viewerToken, "DELETE", `/api/campaigns/${campaignId}`)).status, 403);

    // Editor can create, but cannot touch financials, reassign owners or delete.
    const editorCreated = await call(editorToken, "POST", "/api/campaigns", { campaign_name: "Editor campaign" });
    assert.equal(editorCreated.status, 201);
    const budgetAttempt = await call(editorToken, "PUT", `/api/campaigns/${campaignId}`, {
      campaign_planned_budget: 1,
    });
    assert.equal(budgetAttempt.status, 400);
    assert.equal(
      (await call(editorToken, "PUT", `/api/campaigns/${campaignId}`, { campaign_user_fk: adminA.user_id })).status,
      400
    );
    assert.equal((await call(editorToken, "DELETE", `/api/campaigns/${campaignId}`)).status, 403);

    // Tenant isolation.
    assert.equal((await call(otherToken, "GET", `/api/campaigns/${campaignId}`)).status, 404);
    assert.equal((await call(otherToken, "DELETE", `/api/campaigns/${campaignId}`)).status, 404);
    assert.equal(
      (await call(otherToken, "PUT", `/api/campaigns/${campaignId}`, { campaign_name: "Hijack" })).status,
      404
    );

    // Delete: soft delete, records preserved, relationships detached.
    assert.equal((await call(adminToken, "DELETE", `/api/campaigns/${campaignId}`)).status, 200);
    assert.ok(await prisma.contact.findUnique({ where: { contact_id: contactA.contact_id } }));
    const keptOpportunity = await prisma.opportunity.findUnique({
      where: { opportunity_id: opportunityA.opportunity_id },
    });
    assert.ok(keptOpportunity);
    assert.equal(keptOpportunity.opportunity_campaign_id, null);
    const keptTask = await prisma.task.findUnique({ where: { task_id: createdTask.body.task_id } });
    assert.ok(keptTask);
    assert.equal(keptTask.task_campaign_fk, null);
    assert.equal((await call(adminToken, "GET", `/api/campaigns/${campaignId}`)).status, 404);
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections?.();
    });
    await prisma.task.deleteMany({ where: { tenant_fk: { in: [tenantA.tenant_id, tenantB.tenant_id] } } });
    await prisma.contact.deleteMany({ where: { tenant_fk: { in: [tenantA.tenant_id, tenantB.tenant_id] } } });
    await prisma.opportunity.deleteMany({ where: { tenant_fk: { in: [tenantA.tenant_id, tenantB.tenant_id] } } });
    await prisma.campaign.deleteMany({ where: { tenant_fk: { in: [tenantA.tenant_id, tenantB.tenant_id] } } });
    await prisma.user.deleteMany({ where: { tenant_fk: { in: [tenantA.tenant_id, tenantB.tenant_id] } } });
    await prisma.organization_app_entitlement.deleteMany({
      where: { tenant_fk: { in: [tenantA.tenant_id, tenantB.tenant_id] } },
    });
    await prisma.tenant.deleteMany({ where: { tenant_id: { in: [tenantA.tenant_id, tenantB.tenant_id] } } });
    await prisma.$disconnect();
  }
});
