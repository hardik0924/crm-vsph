-- Campaign Management module: additive only, existing campaigns are preserved.
ALTER TABLE `campaigns`
  ADD COLUMN `campaign_code` VARCHAR(191) NULL,
  ADD COLUMN `campaign_type` ENUM('EMAIL', 'SOCIAL_MEDIA', 'WEBINAR', 'EVENT', 'ADVERTISEMENT', 'PHONE_OUTREACH', 'DIRECT_MARKETING', 'REFERRAL', 'OTHER') NULL DEFAULT 'OTHER',
  ADD COLUMN `campaign_objective` TEXT NULL,
  ADD COLUMN `campaign_description` TEXT NULL,
  ADD COLUMN `campaign_status` ENUM('DRAFT', 'PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN `campaign_priority` ENUM('NORMAL', 'HIGH', 'LOW') NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN `campaign_start_date` DATETIME(3) NULL,
  ADD COLUMN `campaign_end_date` DATETIME(3) NULL,
  ADD COLUMN `campaign_launch_date` DATETIME(3) NULL,
  ADD COLUMN `campaign_planned_budget` DECIMAL(18, 2) NULL,
  ADD COLUMN `campaign_actual_cost` DECIMAL(18, 2) NULL,
  ADD COLUMN `campaign_expected_revenue` DECIMAL(18, 2) NULL,
  ADD COLUMN `campaign_target_contacts` INTEGER NULL,
  ADD COLUMN `campaign_target_leads` INTEGER NULL,
  ADD COLUMN `campaign_target_opportunities` INTEGER NULL,
  ADD COLUMN `campaign_created_by_fk` VARCHAR(191) NULL;

ALTER TABLE `tasks`
  ADD COLUMN `task_campaign_fk` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `campaigns_tenant_fk_campaign_code_key` ON `campaigns`(`tenant_fk`, `campaign_code`);
CREATE INDEX `campaigns_tenant_fk_campaign_status_idx` ON `campaigns`(`tenant_fk`, `campaign_status`);
CREATE INDEX `campaigns_campaign_start_date_idx` ON `campaigns`(`campaign_start_date`);
CREATE INDEX `tasks_task_campaign_fk_idx` ON `tasks`(`task_campaign_fk`);

ALTER TABLE `campaigns`
  ADD CONSTRAINT `campaigns_campaign_created_by_fk_fkey`
  FOREIGN KEY (`campaign_created_by_fk`) REFERENCES `users`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `tasks`
  ADD CONSTRAINT `tasks_task_campaign_fk_fkey`
  FOREIGN KEY (`task_campaign_fk`) REFERENCES `campaigns`(`campaign_id`) ON DELETE SET NULL ON UPDATE CASCADE;
