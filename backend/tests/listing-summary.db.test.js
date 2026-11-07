import test from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/server.js";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/passwords.js";
import { signSessionToken } from "../src/lib/session.js";

const runDbTests = process.env.RUN_DB_TESTS === "1";

process.env.AUTH_TOKEN_SECRET ||= "listing-summary-test-secret-key-32-chars";

test("contacts, accounts, opportunities and tasks listings return real summaries and filters", { skip: !runDbTests }, async () => {
  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { tenant_name: "Listing", tenant_code: `LS${stamp}`.slice(0, 20), tenant_status: "ACTIVE" },
  });
  await prisma.organization_app_entitlement.create({
    data: {
      tenant_fk: tenant.tenant_id,
      app_code: "CRM",
      entitlement_status: "ACTIVE",
      effective_start: new Date(Date.now() - 86400000),
    },
  });
  const admin = await prisma.user.create({
    data: {
      user_name: "Listing Admin",
      user_email: `listing.${stamp}@example.test`,
      user_password: await hashPassword("Password123!"),
      user_role: "ADMIN",
      user_is_tenant_owner: true,
      tenant_fk: tenant.tenant_id,
    },
  });
  const industry = await prisma.industry.create({
    data: { tenant_fk: tenant.tenant_id, industry_name: `Industry ${stamp}` },
  });
  const activeAccount = await prisma.account.create({
    data: {
      tenant_fk: tenant.tenant_id,
      account_owner_fk: admin.user_id,
      account_code: `A1-${stamp}`,
      account_name: "Active account",
      account_account_status: "ACTIVE",
      account_industry_fk: industry.industry_id,
    },
  });
  const inactiveAccount = await prisma.account.create({
    data: {
      tenant_fk: tenant.tenant_id,
      account_owner_fk: admin.user_id,
      account_code: `A2-${stamp}`,
      account_name: "Inactive account",
      account_account_status: "INACTIVE",
    },
  });
  await prisma.contact.createMany({
    data: [
      {
        tenant_fk: tenant.tenant_id,
        contact_code: `C1-${stamp}`,
        contact_firstname: "Connected",
        contact_lastname: "Person",
        contact_owner_fk: admin.user_id,
        contact_account_fk: activeAccount.account_id,
        contact_call_status: "CONNECTED",
      },
      {
        tenant_fk: tenant.tenant_id,
        contact_code: `C2-${stamp}`,
        contact_firstname: "Pitched",
        contact_lastname: "Person",
        contact_owner_fk: admin.user_id,
        contact_call_status: "PITCH_DONE",
      },
    ],
  });
  await prisma.opportunity.createMany({
    data: [
      {
        tenant_fk: tenant.tenant_id,
        opportunity_owner_fk: admin.user_id,
        opportunity_name: "Won deal",
        opportunity_close_date: new Date("2026-11-01"),
        opportunity_stage: "CLOSED_WON",
        opportunity_account_fk: activeAccount.account_id,
      },
      {
        tenant_fk: tenant.tenant_id,
        opportunity_owner_fk: admin.user_id,
        opportunity_name: "Open deal",
        opportunity_close_date: new Date("2026-11-01"),
        opportunity_stage: "PITCH_DONE",
        opportunity_account_fk: inactiveAccount.account_id,
      },
    ],
  });
  await prisma.task.createMany({
    data: [
      {
        tenant_fk: tenant.tenant_id,
        task_user_fk: admin.user_id,
        task_subject: "Overdue task",
        task_status: "TODO",
        task_due_date: new Date("2020-01-01"),
      },
      {
        tenant_fk: tenant.tenant_id,
        task_user_fk: admin.user_id,
        task_subject: "Finished task",
        task_status: "COMPLETED",
        task_due_date: new Date("2020-01-01"),
      },
    ],
  });

  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = signSessionToken(admin);
  const get = async (path) => {
    const response = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: response.status, body: await response.json() };
  };

  try {
    const contacts = await get("/api/contacts?page=1&limit=20");
    assert.equal(contacts.status, 200);
    assert.equal(contacts.body.summary.total, 2);
    assert.equal(contacts.body.summary.byCallStatus.CONNECTED, 1);
    assert.equal(contacts.body.summary.byCallStatus.PITCH_DONE, 1);
    assert.equal(contacts.body.summary.withAccount, 1);

    const filteredContacts = await get("/api/contacts?status=CONNECTED");
    assert.equal(filteredContacts.body.data.length, 1);
    assert.equal(filteredContacts.body.data[0].contact_call_status, "CONNECTED");
    assert.equal((await get("/api/contacts?status=NOT_A_STATUS")).status, 400);

    const accounts = await get("/api/accounts?page=1&limit=20");
    assert.equal(accounts.status, 200);
    assert.equal(accounts.body.summary.total, 2);
    assert.equal(accounts.body.summary.byStatus.ACTIVE, 1);
    assert.equal(accounts.body.summary.byStatus.INACTIVE, 1);
    assert.equal(accounts.body.summary.withContacts, 1);
    assert.equal(accounts.body.summary.industries, 1);

    const filteredAccounts = await get("/api/accounts?status=INACTIVE");
    assert.equal(filteredAccounts.body.data.length, 1);
    assert.equal(filteredAccounts.body.data[0].account_name, "Inactive account");
    assert.equal((await get("/api/accounts?status=SUSPENDED")).status, 400);

    const opportunities = await get("/api/opportunities?page=1&limit=20");
    assert.equal(opportunities.status, 200);
    assert.equal(opportunities.body.summary.total, 2);
    assert.equal(opportunities.body.summary.byStage.CLOSED_WON, 1);
    assert.equal(opportunities.body.summary.byStage.PITCH_DONE, 1);

    const filteredOpportunities = await get("/api/opportunities?stage=CLOSED_WON");
    assert.equal(filteredOpportunities.body.data.length, 1);
    assert.equal(filteredOpportunities.body.data[0].opportunity_name, "Won deal");
    assert.equal((await get("/api/opportunities?stage=NOPE")).status, 400);

    const tasks = await get("/api/tasks?page=1&limit=20");
    assert.equal(tasks.status, 200);
    assert.equal(tasks.body.summary.total, 2);
    assert.equal(tasks.body.summary.byStatus.TODO, 1);
    assert.equal(tasks.body.summary.byStatus.COMPLETED, 1);
    assert.equal(tasks.body.summary.overdue, 1);

    const filteredTasks = await get("/api/tasks?status=TODO");
    assert.equal(filteredTasks.body.data.length, 1);
    assert.equal(filteredTasks.body.data[0].task_subject, "Overdue task");
    assert.equal((await get("/api/tasks?status=NOPE")).status, 400);
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections?.();
    });
    await prisma.contact.deleteMany({ where: { tenant_fk: tenant.tenant_id } });
    await prisma.opportunity.deleteMany({ where: { tenant_fk: tenant.tenant_id } });
    await prisma.task.deleteMany({ where: { tenant_fk: tenant.tenant_id } });
    await prisma.account.deleteMany({ where: { tenant_fk: tenant.tenant_id } });
    await prisma.industry.deleteMany({ where: { tenant_fk: tenant.tenant_id } });
    await prisma.user.deleteMany({ where: { tenant_fk: tenant.tenant_id } });
    await prisma.organization_app_entitlement.deleteMany({ where: { tenant_fk: tenant.tenant_id } });
    await prisma.tenant.deleteMany({ where: { tenant_id: tenant.tenant_id } });
    await prisma.$disconnect();
  }
});
