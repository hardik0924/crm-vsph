-- Rollback for 20261107090000_campaign_management. Drops only added columns.
ALTER TABLE `tasks` DROP FOREIGN KEY `tasks_task_campaign_fk_fkey`;
ALTER TABLE `tasks` DROP INDEX `tasks_task_campaign_fk_idx`;
ALTER TABLE `tasks` DROP COLUMN `task_campaign_fk`;

ALTER TABLE `campaigns` DROP FOREIGN KEY `campaigns_campaign_created_by_fk_fkey`;
DROP INDEX `campaigns_campaign_start_date_idx` ON `campaigns`;
DROP INDEX `campaigns_tenant_fk_campaign_status_idx` ON `campaigns`;
DROP INDEX `campaigns_tenant_fk_campaign_code_key` ON `campaigns`;

ALTER TABLE `campaigns`
  DROP COLUMN `campaign_created_by_fk`,
  DROP COLUMN `campaign_target_opportunities`,
  DROP COLUMN `campaign_target_leads`,
  DROP COLUMN `campaign_target_contacts`,
  DROP COLUMN `campaign_expected_revenue`,
  DROP COLUMN `campaign_actual_cost`,
  DROP COLUMN `campaign_planned_budget`,
  DROP COLUMN `campaign_launch_date`,
  DROP COLUMN `campaign_end_date`,
  DROP COLUMN `campaign_start_date`,
  DROP COLUMN `campaign_priority`,
  DROP COLUMN `campaign_status`,
  DROP COLUMN `campaign_description`,
  DROP COLUMN `campaign_objective`,
  DROP COLUMN `campaign_type`,
  DROP COLUMN `campaign_code`;
