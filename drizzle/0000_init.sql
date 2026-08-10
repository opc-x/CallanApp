CREATE TABLE IF NOT EXISTS "app_meta" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
COMMENT ON TABLE "app_meta" IS 'CallanApp bootstrap table';
