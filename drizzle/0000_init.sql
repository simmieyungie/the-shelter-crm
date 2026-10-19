CREATE TYPE "public"."message_channel" AS ENUM('SMS', 'WHATSAPP', 'EMAIL');--> statement-breakpoint
CREATE TYPE "public"."department_role" AS ENUM('MEMBER', 'EXCO', 'ASSISTANT_HOD', 'HOD');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('MALE', 'FEMALE');--> statement-breakpoint
CREATE TYPE "public"."import_outcome" AS ENUM('READY', 'NEEDS_FIX', 'DUPLICATE', 'SKIPPED', 'IMPORTED');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('UPLOADED', 'MAPPED', 'VALIDATED', 'COMMITTED', 'UNDONE');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('FIRST_TIMER', 'NEW_CONVERT', 'REGULAR_MEMBER', 'WORKER', 'ORDAINED_MINISTER');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('QUEUED', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."milestone" AS ENUM('WATER_BAPTISM', 'HOLY_GHOST_BAPTISM', 'BELIEVERS_CLASS', 'WORKERS_IN_TRAINING', 'SCHOOL_OF_DISCIPLES', 'RCBC');--> statement-breakpoint
CREATE TYPE "public"."record_source" AS ENUM('TALLY', 'MANUAL', 'IMPORT');--> statement-breakpoint
CREATE TYPE "public"."recurrence" AS ENUM('WEEKLY', 'MONTHLY_FIRST_FRIDAY', 'SPECIAL');--> statement-breakpoint
CREATE TYPE "public"."remittance_status" AS ENUM('OUTSTANDING', 'PARTIAL', 'CLEARED');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('DRAFT', 'SUBMITTED', 'VERIFIED', 'REOPENED');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('USHER', 'HEAD_USHER', 'SECRETARY', 'HOD', 'TRIBE_LEADER', 'PARISH_PASTOR', 'AREA_PASTOR', 'ZONAL_PASTOR', 'PROVINCIAL_ADMIN', 'SYSTEM_ADMIN');--> statement-breakpoint
CREATE TYPE "public"."scope_level" AS ENUM('PARISH', 'AREA', 'ZONE', 'PROVINCE', 'REGION', 'GLOBAL');--> statement-breakpoint
CREATE TYPE "public"."task_kind" AS ENUM('OPERATIONS', 'FOLLOW_UP');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "areas_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "attendance_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_event_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_checkins_service_event_id_member_id_unique" UNIQUE("service_event_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "department_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"role" "department_role" DEFAULT 'MEMBER' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "department_memberships_department_id_member_id_unique" UNIQUE("department_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parish_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_parish_id_name_unique" UNIQUE("parish_id","name")
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parish_id" uuid NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"file_name" text NOT NULL,
	"sheet_name" text NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"column_map" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"date_format" text DEFAULT 'DD/MM/YYYY' NOT NULL,
	"options" jsonb NOT NULL,
	"status" "import_status" DEFAULT 'UPLOADED' NOT NULL,
	"committed_at" timestamp with time zone,
	"committed_by" uuid,
	"undone_at" timestamp with time zone,
	"undone_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_batch_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"parsed" jsonb,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"resolution" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"outcome" "import_outcome",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_link_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"milestone" "milestone" NOT NULL,
	"completed_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_milestones_member_id_milestone_unique" UNIQUE("member_id","milestone")
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parish_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text,
	"whatsapp_phone" text,
	"email" text,
	"gender" "gender",
	"date_of_birth" date,
	"address" text,
	"status" "member_status" DEFAULT 'REGULAR_MEMBER' NOT NULL,
	"first_visit_on" date,
	"consent_contact" boolean DEFAULT false NOT NULL,
	"qr_token" text,
	"client_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_qr_token_unique" UNIQUE("qr_token"),
	CONSTRAINT "members_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "outbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parish_id" uuid NOT NULL,
	"channel" "message_channel" NOT NULL,
	"to_phone" text,
	"to_email" text,
	"template_key" text NOT NULL,
	"body" text NOT NULL,
	"status" "message_status" DEFAULT 'QUEUED' NOT NULL,
	"related_member_id" uuid,
	"scheduled_for" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"gateway_response" jsonb,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbound_messages_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "parishes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"area_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"address" text,
	"phone" text,
	"email" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"follow_up_lead_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parishes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "provinces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"region_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provinces_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "regions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "remittance_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_level" "scope_level" NOT NULL,
	"scope_id" uuid,
	"effective_from" date NOT NULL,
	"parish_pct" numeric(5, 2) NOT NULL,
	"area_pct" numeric(5, 2) NOT NULL,
	"zone_pct" numeric(5, 2) NOT NULL,
	"province_pct" numeric(5, 2) NOT NULL,
	"national_pct" numeric(5, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "remittance_policies_sum_100" CHECK ("remittance_policies"."parish_pct" + "remittance_policies"."area_pct" + "remittance_policies"."zone_pct" + "remittance_policies"."province_pct" + "remittance_policies"."national_pct" = 100)
);
--> statement-breakpoint
CREATE TABLE "remittances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parish_id" uuid NOT NULL,
	"period_month" date NOT NULL,
	"amount_due_kobo" bigint DEFAULT 0 NOT NULL,
	"amount_paid_kobo" bigint DEFAULT 0 NOT NULL,
	"status" "remittance_status" DEFAULT 'OUTSTANDING' NOT NULL,
	"cleared_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "remittances_parish_id_period_month_unique" UNIQUE("parish_id","period_month")
);
--> statement-breakpoint
CREATE TABLE "role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	"scope_level" "scope_level" NOT NULL,
	"scope_id" uuid,
	"department_id" uuid,
	"small_group_id" uuid,
	"starts_on" date DEFAULT CURRENT_DATE NOT NULL,
	"ends_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_assignments_scope_id_check" CHECK (("role_assignments"."scope_level" = 'GLOBAL') = ("role_assignments"."scope_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "sanctuary_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parish_id" uuid NOT NULL,
	"name" text NOT NULL,
	"capacity" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sanctuary_zones_parish_id_name_unique" UNIQUE("parish_id","name")
);
--> statement-breakpoint
CREATE TABLE "service_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parish_id" uuid NOT NULL,
	"service_type_id" uuid NOT NULL,
	"event_date" date NOT NULL,
	"start_time" time NOT NULL,
	"occurrence" smallint DEFAULT 1 NOT NULL,
	"preacher" text,
	"theme" text,
	"import_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_events_natural_key" UNIQUE("parish_id","service_type_id","event_date","occurrence"),
	CONSTRAINT "service_events_occurrence_check" CHECK ("service_events"."occurrence" >= 1)
);
--> statement-breakpoint
CREATE TABLE "service_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_event_id" uuid NOT NULL,
	"men" integer,
	"women" integer,
	"children" integer,
	"first_timers" integer,
	"workers_on_duty" integer,
	"offering_kobo" bigint,
	"tithe_kobo" bigint,
	"special_seed_kobo" bigint,
	"currency" char(3) DEFAULT 'NGN' NOT NULL,
	"notes" text,
	"source" "record_source" NOT NULL,
	"import_batch_id" uuid,
	"status" "report_status" DEFAULT 'DRAFT' NOT NULL,
	"drafted_by" uuid,
	"submitted_at" timestamp with time zone,
	"submitted_by" uuid,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_reports_service_event_id_unique" UNIQUE("service_event_id"),
	CONSTRAINT "service_reports_non_negative" CHECK (coalesce("service_reports"."men",0) >= 0 AND coalesce("service_reports"."women",0) >= 0 AND coalesce("service_reports"."children",0) >= 0
          AND coalesce("service_reports"."first_timers",0) >= 0 AND coalesce("service_reports"."workers_on_duty",0) >= 0
          AND coalesce("service_reports"."offering_kobo",0) >= 0 AND coalesce("service_reports"."tithe_kobo",0) >= 0
          AND coalesce("service_reports"."special_seed_kobo",0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "service_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parish_id" uuid NOT NULL,
	"name" text NOT NULL,
	"day_of_week" integer,
	"start_time" time NOT NULL,
	"location" text,
	"recurrence" "recurrence" DEFAULT 'WEEKLY' NOT NULL,
	"max_per_day" smallint DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_types_parish_id_name_unique" UNIQUE("parish_id","name"),
	CONSTRAINT "service_types_max_per_day_check" CHECK ("service_types"."max_per_day" >= 1),
	CONSTRAINT "service_types_day_of_week_check" CHECK ("service_types"."day_of_week" IS NULL OR ("service_types"."day_of_week" BETWEEN 0 AND 6))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "small_group_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"small_group_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"joined_on" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "small_group_memberships_small_group_id_member_id_unique" UNIQUE("small_group_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "small_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parish_id" uuid NOT NULL,
	"type_name" text DEFAULT 'Tribe' NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"landmark" text,
	"leader_member_id" uuid,
	"assistant_member_id" uuid,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parish_id" uuid NOT NULL,
	"service_event_id" uuid,
	"department_id" uuid,
	"member_id" uuid,
	"kind" "task_kind" DEFAULT 'OPERATIONS' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"priority" "task_priority" DEFAULT 'MEDIUM' NOT NULL,
	"status" "task_status" DEFAULT 'TODO' NOT NULL,
	"assigned_by" uuid,
	"assigned_to" uuid NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"password_hash" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "usher_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_event_id" uuid NOT NULL,
	"sanctuary_zone_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"is_lead" boolean DEFAULT false NOT NULL,
	"checked_in_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usher_assignments_service_event_id_user_id_unique" UNIQUE("service_event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "zone_tallies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_event_id" uuid NOT NULL,
	"sanctuary_zone_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"men" integer DEFAULT 0 NOT NULL,
	"women" integer DEFAULT 0 NOT NULL,
	"children" integer DEFAULT 0 NOT NULL,
	"first_timers" integer DEFAULT 0 NOT NULL,
	"client_id" uuid NOT NULL,
	"client_updated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zone_tallies_client_id_unique" UNIQUE("client_id"),
	CONSTRAINT "zone_tallies_natural_key" UNIQUE("service_event_id","sanctuary_zone_id","user_id"),
	CONSTRAINT "zone_tallies_non_negative" CHECK ("zone_tallies"."men" >= 0 AND "zone_tallies"."women" >= 0 AND "zone_tallies"."children" >= 0 AND "zone_tallies"."first_timers" >= 0)
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"province_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zones_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_checkins" ADD CONSTRAINT "attendance_checkins_service_event_id_service_events_id_fk" FOREIGN KEY ("service_event_id") REFERENCES "public"."service_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_checkins" ADD CONSTRAINT "attendance_checkins_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_checkins" ADD CONSTRAINT "attendance_checkins_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_memberships" ADD CONSTRAINT "department_memberships_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_memberships" ADD CONSTRAINT "department_memberships_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_parish_id_parishes_id_fk" FOREIGN KEY ("parish_id") REFERENCES "public"."parishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_parish_id_parishes_id_fk" FOREIGN KEY ("parish_id") REFERENCES "public"."parishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_committed_by_users_id_fk" FOREIGN KEY ("committed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_undone_by_users_id_fk" FOREIGN KEY ("undone_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_link_tokens" ADD CONSTRAINT "magic_link_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_milestones" ADD CONSTRAINT "member_milestones_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_parish_id_parishes_id_fk" FOREIGN KEY ("parish_id") REFERENCES "public"."parishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_parish_id_parishes_id_fk" FOREIGN KEY ("parish_id") REFERENCES "public"."parishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_related_member_id_members_id_fk" FOREIGN KEY ("related_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parishes" ADD CONSTRAINT "parishes_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parishes" ADD CONSTRAINT "parishes_follow_up_lead_user_id_users_id_fk" FOREIGN KEY ("follow_up_lead_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provinces" ADD CONSTRAINT "provinces_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remittances" ADD CONSTRAINT "remittances_parish_id_parishes_id_fk" FOREIGN KEY ("parish_id") REFERENCES "public"."parishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_small_group_id_small_groups_id_fk" FOREIGN KEY ("small_group_id") REFERENCES "public"."small_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctuary_zones" ADD CONSTRAINT "sanctuary_zones_parish_id_parishes_id_fk" FOREIGN KEY ("parish_id") REFERENCES "public"."parishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_events" ADD CONSTRAINT "service_events_parish_id_parishes_id_fk" FOREIGN KEY ("parish_id") REFERENCES "public"."parishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_events" ADD CONSTRAINT "service_events_service_type_id_service_types_id_fk" FOREIGN KEY ("service_type_id") REFERENCES "public"."service_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_events" ADD CONSTRAINT "service_events_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_service_event_id_service_events_id_fk" FOREIGN KEY ("service_event_id") REFERENCES "public"."service_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_drafted_by_users_id_fk" FOREIGN KEY ("drafted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_reports" ADD CONSTRAINT "service_reports_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_types" ADD CONSTRAINT "service_types_parish_id_parishes_id_fk" FOREIGN KEY ("parish_id") REFERENCES "public"."parishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "small_group_memberships" ADD CONSTRAINT "small_group_memberships_small_group_id_small_groups_id_fk" FOREIGN KEY ("small_group_id") REFERENCES "public"."small_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "small_group_memberships" ADD CONSTRAINT "small_group_memberships_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "small_groups" ADD CONSTRAINT "small_groups_parish_id_parishes_id_fk" FOREIGN KEY ("parish_id") REFERENCES "public"."parishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "small_groups" ADD CONSTRAINT "small_groups_leader_member_id_members_id_fk" FOREIGN KEY ("leader_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "small_groups" ADD CONSTRAINT "small_groups_assistant_member_id_members_id_fk" FOREIGN KEY ("assistant_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parish_id_parishes_id_fk" FOREIGN KEY ("parish_id") REFERENCES "public"."parishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_service_event_id_service_events_id_fk" FOREIGN KEY ("service_event_id") REFERENCES "public"."service_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usher_assignments" ADD CONSTRAINT "usher_assignments_service_event_id_service_events_id_fk" FOREIGN KEY ("service_event_id") REFERENCES "public"."service_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usher_assignments" ADD CONSTRAINT "usher_assignments_sanctuary_zone_id_sanctuary_zones_id_fk" FOREIGN KEY ("sanctuary_zone_id") REFERENCES "public"."sanctuary_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usher_assignments" ADD CONSTRAINT "usher_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_tallies" ADD CONSTRAINT "zone_tallies_service_event_id_service_events_id_fk" FOREIGN KEY ("service_event_id") REFERENCES "public"."service_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_tallies" ADD CONSTRAINT "zone_tallies_sanctuary_zone_id_sanctuary_zones_id_fk" FOREIGN KEY ("sanctuary_zone_id") REFERENCES "public"."sanctuary_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_tallies" ADD CONSTRAINT "zone_tallies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zones" ADD CONSTRAINT "zones_province_id_provinces_id_fk" FOREIGN KEY ("province_id") REFERENCES "public"."provinces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "areas_zone_id_index" ON "areas" USING btree ("zone_id");--> statement-breakpoint
CREATE INDEX "attendance_checkins_member_id_index" ON "attendance_checkins" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_entity_id_index" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "import_batches_parish_id_index" ON "import_batches" USING btree ("parish_id");--> statement-breakpoint
CREATE INDEX "import_rows_import_batch_id_row_number_index" ON "import_rows" USING btree ("import_batch_id","row_number");--> statement-breakpoint
CREATE INDEX "members_parish_id_index" ON "members" USING btree ("parish_id");--> statement-breakpoint
CREATE INDEX "members_phone_index" ON "members" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "members_parish_id_status_index" ON "members" USING btree ("parish_id","status");--> statement-breakpoint
CREATE INDEX "outbound_messages_status_scheduled_for_index" ON "outbound_messages" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "outbound_messages_related_member_id_index" ON "outbound_messages" USING btree ("related_member_id");--> statement-breakpoint
CREATE INDEX "parishes_area_id_index" ON "parishes" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "provinces_region_id_index" ON "provinces" USING btree ("region_id");--> statement-breakpoint
CREATE INDEX "role_assignments_user_id_index" ON "role_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sanctuary_zones_parish_id_index" ON "sanctuary_zones" USING btree ("parish_id");--> statement-breakpoint
CREATE INDEX "service_events_parish_id_event_date_index" ON "service_events" USING btree ("parish_id","event_date");--> statement-breakpoint
CREATE INDEX "service_reports_status_index" ON "service_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "service_reports_import_batch_id_index" ON "service_reports" USING btree ("import_batch_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_index" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "small_groups_parish_id_index" ON "small_groups" USING btree ("parish_id");--> statement-breakpoint
CREATE INDEX "tasks_assigned_to_status_index" ON "tasks" USING btree ("assigned_to","status");--> statement-breakpoint
CREATE INDEX "tasks_parish_id_status_index" ON "tasks" USING btree ("parish_id","status");--> statement-breakpoint
CREATE INDEX "zones_province_id_index" ON "zones" USING btree ("province_id");