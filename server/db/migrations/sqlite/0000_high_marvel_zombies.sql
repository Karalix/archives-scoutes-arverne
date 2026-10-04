CREATE TABLE `access_password` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text DEFAULT 'default' NOT NULL,
	`scout_year` integer NOT NULL,
	`lookup` text NOT NULL,
	`hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text,
	`revoked_at` integer,
	`use_count` integer DEFAULT 0 NOT NULL,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE INDEX `access_password_lookup` ON `access_password` (`lookup`);--> statement-breakpoint
CREATE TABLE `admin_link` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text DEFAULT 'default' NOT NULL,
	`kind` text NOT NULL,
	`token_hash` text NOT NULL,
	`email` text,
	`name` text,
	`role` text,
	`user_id` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_link_token` ON `admin_link` (`token_hash`);--> statement-breakpoint
CREATE TABLE `admin_user` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text DEFAULT 'default' NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`password_hash` text,
	`session_version` integer DEFAULT 1 NOT NULL,
	`disabled_at` integer,
	`created_at` integer NOT NULL,
	`last_login_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_user_email` ON `admin_user` (`instance_id`,`email`);--> statement-breakpoint
CREATE TABLE `api_token` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text DEFAULT 'default' NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`scopes` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_token_hash` ON `api_token` (`token_hash`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text DEFAULT 'default' NOT NULL,
	`actor` text NOT NULL,
	`actor_name` text,
	`action` text NOT NULL,
	`target` text,
	`before` text,
	`after` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_created` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `document` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text DEFAULT 'default' NOT NULL,
	`year_id` text NOT NULL,
	`event_id` text,
	`external_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`branch` text,
	`place` text DEFAULT '' NOT NULL,
	`date` text,
	`credits` text DEFAULT '' NOT NULL,
	`people` text DEFAULT '' NOT NULL,
	`visibility` text DEFAULT 'inherit' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`status_before_trash` text,
	`storage_key` text,
	`display_key` text,
	`thumb_key` text,
	`original_key` text,
	`captions_key` text,
	`chapters` text,
	`duration` integer,
	`width` integer,
	`height` integer,
	`size` integer,
	`original_size` integer,
	`mime` text,
	`downloadable` integer,
	`stream_uid` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`published_at` integer,
	`trashed_at` integer
);
--> statement-breakpoint
CREATE INDEX `document_year` ON `document` (`year_id`);--> statement-breakpoint
CREATE INDEX `document_event` ON `document` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `document_external` ON `document` (`instance_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `document_tag` (
	`document_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`document_id`, `tag_id`)
);
--> statement-breakpoint
CREATE TABLE `event` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text DEFAULT 'default' NOT NULL,
	`year_id` text NOT NULL,
	`type` text DEFAULT 'camp' NOT NULL,
	`title` text NOT NULL,
	`place` text DEFAULT '' NOT NULL,
	`start_date` text,
	`end_date` text,
	`branch` text,
	`cover_document_id` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `event_year` ON `event` (`year_id`);--> statement-breakpoint
CREATE TABLE `idempotency` (
	`key` text PRIMARY KEY NOT NULL,
	`response` text NOT NULL,
	`status` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `instance` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT 'Archives du groupe' NOT NULL,
	`slug` text DEFAULT 'groupe' NOT NULL,
	`logo_key` text,
	`primary_color` text DEFAULT '#2f7d32' NOT NULL,
	`intro` text DEFAULT '' NOT NULL,
	`legal` text DEFAULT '' NOT NULL,
	`privacy` text DEFAULT '' NOT NULL,
	`contact_email` text DEFAULT '' NOT NULL,
	`pivot_mode` text DEFAULT 'sliding' NOT NULL,
	`pivot_year` integer DEFAULT 2015 NOT NULL,
	`pivot_offset` integer DEFAULT 10 NOT NULL,
	`switch_month` integer DEFAULT 9 NOT NULL,
	`branches` text NOT NULL,
	`event_types` text NOT NULL,
	`settings` text NOT NULL,
	`installed_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `passkey` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`backed_up` integer DEFAULT false NOT NULL,
	`transports` text,
	`name` text DEFAULT 'Passkey' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rate_limit` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`window_start` integer NOT NULL,
	`blocked_until` integer
);
--> statement-breakpoint
CREATE TABLE `report` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text DEFAULT 'default' NOT NULL,
	`document_id` text NOT NULL,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`ip_hash` text,
	`status` text DEFAULT 'open' NOT NULL,
	`handled_by` text,
	`created_at` integer NOT NULL,
	`handled_at` integer
);
--> statement-breakpoint
CREATE TABLE `security_log` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text DEFAULT 'default' NOT NULL,
	`kind` text NOT NULL,
	`ip_hash` text,
	`detail` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tag` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text DEFAULT 'default' NOT NULL,
	`label` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tag_label` ON `tag` (`instance_id`,`label`);--> statement-breakpoint
CREATE TABLE `upload` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text DEFAULT 'default' NOT NULL,
	`document_id` text NOT NULL,
	`variant` text NOT NULL,
	`storage_key` text NOT NULL,
	`upload_id` text NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`part_size` integer NOT NULL,
	`parts` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `upload_document` ON `upload` (`document_id`);--> statement-breakpoint
CREATE TABLE `usage_stat` (
	`month` text NOT NULL,
	`instance_id` text DEFAULT 'default' NOT NULL,
	`bytes_served` integer DEFAULT 0 NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`instance_id`, `month`)
);
--> statement-breakpoint
CREATE TABLE `year` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text DEFAULT 'default' NOT NULL,
	`start_year` integer NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`cover_document_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `year_instance_start` ON `year` (`instance_id`,`start_year`);