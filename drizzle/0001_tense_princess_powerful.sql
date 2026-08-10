CREATE TABLE IF NOT EXISTS "progress" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"done" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last" integer,
	"pos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"saved" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"days" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
