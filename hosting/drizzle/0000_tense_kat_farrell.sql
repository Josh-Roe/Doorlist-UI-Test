CREATE TABLE `doorlist_auth_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` integer NOT NULL,
	`last_at` integer NOT NULL,
	`attempts` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `doorlist_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`ciphertext` text NOT NULL,
	`expires_at` integer NOT NULL
);
