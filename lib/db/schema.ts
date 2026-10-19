import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const id = () => uuid("id").primaryKey().defaultRandom();
const tsz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const timestamps = {
  createdAt: tsz("created_at").notNull().defaultNow(),
  updatedAt: tsz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
const kobo = (name: string) => bigint(name, { mode: "number" });
const day = (name: string) => date(name, { mode: "string" });

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const roleEnum = pgEnum("role", [
  "USHER",
  "HEAD_USHER",
  "SECRETARY",
  "HOD",
  "TRIBE_LEADER",
  "PARISH_PASTOR",
  "AREA_PASTOR",
  "ZONAL_PASTOR",
  "PROVINCIAL_ADMIN",
  "SYSTEM_ADMIN",
]);
export const scopeLevelEnum = pgEnum("scope_level", [
  "PARISH",
  "AREA",
  "ZONE",
  "PROVINCE",
  "REGION",
  "GLOBAL",
]);
export const memberStatusEnum = pgEnum("member_status", [
  "FIRST_TIMER",
  "NEW_CONVERT",
  "REGULAR_MEMBER",
  "WORKER",
  "ORDAINED_MINISTER",
]);
export const genderEnum = pgEnum("gender", ["MALE", "FEMALE"]);
export const milestoneEnum = pgEnum("milestone", [
  "WATER_BAPTISM",
  "HOLY_GHOST_BAPTISM",
  "BELIEVERS_CLASS",
  "WORKERS_IN_TRAINING",
  "SCHOOL_OF_DISCIPLES",
  "RCBC",
]);
export const deptRoleEnum = pgEnum("department_role", ["MEMBER", "EXCO", "ASSISTANT_HOD", "HOD"]);
export const recurrenceEnum = pgEnum("recurrence", ["WEEKLY", "MONTHLY_FIRST_FRIDAY", "SPECIAL"]);
export const recordSourceEnum = pgEnum("record_source", ["TALLY", "MANUAL", "IMPORT"]);
export const reportStatusEnum = pgEnum("report_status", [
  "DRAFT",
  "SUBMITTED",
  "VERIFIED",
  "REOPENED",
]);
export const importStatusEnum = pgEnum("import_status", [
  "UPLOADED",
  "MAPPED",
  "VALIDATED",
  "COMMITTED",
  "UNDONE",
]);
export const importOutcomeEnum = pgEnum("import_outcome", [
  "READY",
  "NEEDS_FIX",
  "DUPLICATE",
  "SKIPPED",
  "IMPORTED",
]);
export const taskPriorityEnum = pgEnum("task_priority", ["LOW", "MEDIUM", "HIGH", "URGENT"]);
export const taskStatusEnum = pgEnum("task_status", [
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
  "CANCELLED",
]);
export const taskKindEnum = pgEnum("task_kind", ["OPERATIONS", "FOLLOW_UP"]);
export const remittanceStatusEnum = pgEnum("remittance_status", [
  "OUTSTANDING",
  "PARTIAL",
  "CLEARED",
]);
export const channelEnum = pgEnum("message_channel", ["SMS", "WHATSAPP", "EMAIL"]);
export const messageStatusEnum = pgEnum("message_status", ["QUEUED", "SENT", "FAILED"]);

// ---------------------------------------------------------------------------
// 5.1 Hierarchy
// ---------------------------------------------------------------------------

export const regions = pgTable("regions", {
  id: id(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  ...timestamps,
});

export const provinces = pgTable(
  "provinces",
  {
    id: id(),
    regionId: uuid("region_id")
      .notNull()
      .references(() => regions.id),
    name: text("name").notNull(),
    code: text("code").notNull().unique(),
    ...timestamps,
  },
  (t) => [index().on(t.regionId)],
);

export const zones = pgTable(
  "zones",
  {
    id: id(),
    provinceId: uuid("province_id")
      .notNull()
      .references(() => provinces.id),
    name: text("name").notNull(),
    code: text("code").notNull().unique(),
    ...timestamps,
  },
  (t) => [index().on(t.provinceId)],
);

export const areas = pgTable(
  "areas",
  {
    id: id(),
    zoneId: uuid("zone_id")
      .notNull()
      .references(() => zones.id),
    name: text("name").notNull(),
    code: text("code").notNull().unique(),
    ...timestamps,
  },
  (t) => [index().on(t.zoneId)],
);

export const parishes = pgTable(
  "parishes",
  {
    id: id(),
    areaId: uuid("area_id")
      .notNull()
      .references(() => areas.id),
    name: text("name").notNull(),
    code: text("code").notNull().unique(),
    address: text("address"),
    phone: text("phone"),
    email: text("email"),
    isActive: boolean("is_active").notNull().default(true),
    // Who receives Day-3 first-timer call tasks. Falls back to the parish pastor.
    followUpLeadUserId: uuid("follow_up_lead_user_id").references((): AnyPgColumn => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [index().on(t.areaId)],
);

// ---------------------------------------------------------------------------
// 5.3 Members (declared before users because users.member_id references it)
// ---------------------------------------------------------------------------

export const members = pgTable(
  "members",
  {
    id: id(),
    parishId: uuid("parish_id")
      .notNull()
      .references(() => parishes.id),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    // Required for adults in the UI; nullable for children and family members sharing a phone.
    phone: text("phone"),
    whatsappPhone: text("whatsapp_phone"),
    email: text("email"),
    gender: genderEnum("gender"),
    dateOfBirth: day("date_of_birth"),
    address: text("address"),
    status: memberStatusEnum("status").notNull().default("REGULAR_MEMBER"),
    firstVisitOn: day("first_visit_on"),
    consentContact: boolean("consent_contact").notNull().default(false),
    qrToken: text("qr_token").unique(),
    // Idempotency key when the record was created from an offline device.
    clientId: uuid("client_id").unique(),
    ...timestamps,
  },
  (t) => [index().on(t.parishId), index().on(t.phone), index().on(t.parishId, t.status)],
);

export const memberMilestones = pgTable(
  "member_milestones",
  {
    id: id(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    milestone: milestoneEnum("milestone").notNull(),
    completedOn: day("completed_on"),
    ...timestamps,
  },
  (t) => [unique().on(t.memberId, t.milestone)],
);

// ---------------------------------------------------------------------------
// 5.2 Users, roles, scope, sessions
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: id(),
  memberId: uuid("member_id").references(() => members.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  email: text("email").unique(),
  phone: text("phone").unique(),
  passwordHash: text("password_hash"),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

export const sessions = pgTable(
  "sessions",
  {
    // SHA-256 of the cookie token; the raw token is never stored.
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: tsz("expires_at").notNull(),
    createdAt: tsz("created_at").notNull().defaultNow(),
  },
  (t) => [index().on(t.userId)],
);

export const magicLinkTokens = pgTable("magic_link_tokens", {
  id: text("id").primaryKey(), // SHA-256 of the emailed token
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: tsz("expires_at").notNull(),
  usedAt: tsz("used_at"),
  createdAt: tsz("created_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// 5.4 Parish setup
// ---------------------------------------------------------------------------

export const sanctuaryZones = pgTable(
  "sanctuary_zones",
  {
    id: id(),
    parishId: uuid("parish_id")
      .notNull()
      .references(() => parishes.id),
    name: text("name").notNull(),
    capacity: integer("capacity"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index().on(t.parishId), unique().on(t.parishId, t.name)],
);

export const departments = pgTable(
  "departments",
  {
    id: id(),
    parishId: uuid("parish_id")
      .notNull()
      .references(() => parishes.id),
    name: text("name").notNull(),
    ...timestamps,
  },
  (t) => [unique().on(t.parishId, t.name)],
);

export const departmentMemberships = pgTable(
  "department_memberships",
  {
    id: id(),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    role: deptRoleEnum("role").notNull().default("MEMBER"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [unique().on(t.departmentId, t.memberId)],
);

export const smallGroups = pgTable(
  "small_groups",
  {
    id: id(),
    parishId: uuid("parish_id")
      .notNull()
      .references(() => parishes.id),
    typeName: text("type_name").notNull().default("Tribe"),
    name: text("name").notNull(),
    address: text("address"),
    landmark: text("landmark"),
    leaderMemberId: uuid("leader_member_id").references(() => members.id, { onDelete: "set null" }),
    assistantMemberId: uuid("assistant_member_id").references(() => members.id, {
      onDelete: "set null",
    }),
    customFields: jsonb("custom_fields").$type<Record<string, string>>().notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index().on(t.parishId)],
);

export const smallGroupMemberships = pgTable(
  "small_group_memberships",
  {
    id: id(),
    smallGroupId: uuid("small_group_id")
      .notNull()
      .references(() => smallGroups.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    joinedOn: day("joined_on"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [unique().on(t.smallGroupId, t.memberId)],
);

export const serviceTypes = pgTable(
  "service_types",
  {
    id: id(),
    parishId: uuid("parish_id")
      .notNull()
      .references(() => parishes.id),
    name: text("name").notNull(),
    dayOfWeek: integer("day_of_week"), // 0 = Sunday … 6 = Saturday
    startTime: time("start_time").notNull(),
    location: text("location"),
    recurrence: recurrenceEnum("recurrence").notNull().default("WEEKLY"),
    // How many services of this type may hold on one date (parish-configured).
    maxPerDay: smallint("max_per_day").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    unique().on(t.parishId, t.name),
    check("service_types_max_per_day_check", sql`${t.maxPerDay} >= 1`),
    check(
      "service_types_day_of_week_check",
      sql`${t.dayOfWeek} IS NULL OR (${t.dayOfWeek} BETWEEN 0 AND 6)`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// 5.7 Import batches (declared early: reports and events reference them)
// ---------------------------------------------------------------------------

export type ImportColumnMap = Record<string, string>; // column index -> canonical field | "skip"
export type ImportOptions = {
  headerRowIndex: number;
  headers: string[];
  defaultServiceTypeId?: string | null;
  afterImportStatus?: "SUBMITTED" | "VERIFIED";
  serviceNameMap?: Record<string, string | "skip">; // spreadsheet name -> service_type id
  confidence?: Record<string, "high" | "low" | "none">; // auto-match confidence per column
  summary?: { READY: number; NEEDS_FIX: number; DUPLICATE: number; SKIPPED: number };
  result?: { imported: number; firstDate: string | null; lastDate: string | null; createdEvents: number };
};

export const importBatches = pgTable(
  "import_batches",
  {
    id: id(),
    parishId: uuid("parish_id")
      .notNull()
      .references(() => parishes.id),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id),
    fileName: text("file_name").notNull(),
    sheetName: text("sheet_name").notNull(),
    rowCount: integer("row_count").notNull().default(0),
    columnMap: jsonb("column_map").$type<ImportColumnMap>().notNull().default({}),
    dateFormat: text("date_format").notNull().default("DD/MM/YYYY"),
    options: jsonb("options").$type<ImportOptions>().notNull(),
    status: importStatusEnum("status").notNull().default("UPLOADED"),
    committedAt: tsz("committed_at"),
    committedBy: uuid("committed_by").references(() => users.id),
    undoneAt: tsz("undone_at"),
    undoneBy: uuid("undone_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index().on(t.parishId)],
);

export type ImportIssue = {
  type:
    | "DATE_INVALID"
    | "DATE_FUTURE"
    | "DATE_WEEKDAY_MISMATCH"
    | "NON_NUMERIC"
    | "BLANK_COUNT"
    | "UNKNOWN_SERVICE"
    | "NO_SERVICE"
    | "TOTAL_MISMATCH"
    | "DUPLICATE_EXISTING"
    | "DUPLICATE_IN_FILE";
  field?: string;
  value?: string;
  message: string;
  options: string[]; // allowed resolutions
  defaultResolution?: string;
  suggestedDate?: string;
};

export type ImportParsedRow = {
  eventDate: string | null;
  serviceTypeId: string | null;
  serviceName: string | null;
  occurrence: number;
  men: number | null;
  women: number | null;
  children: number | null;
  firstTimers: number | null;
  workersOnDuty: number | null;
  offeringKobo: number | null;
  titheKobo: number | null;
  specialSeedKobo: number | null;
  notes: string | null;
  preacher: string | null;
};

export const importRows = pgTable(
  "import_rows",
  {
    id: id(),
    importBatchId: uuid("import_batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    raw: jsonb("raw").$type<Record<string, string | number | boolean | null>>().notNull(),
    parsed: jsonb("parsed").$type<ImportParsedRow>(),
    issues: jsonb("issues").$type<ImportIssue[]>().notNull().default([]),
    // issue key (type or type:field) -> chosen resolution
    resolution: jsonb("resolution").$type<Record<string, string>>().notNull().default({}),
    outcome: importOutcomeEnum("outcome"),
    ...timestamps,
  },
  (t) => [index().on(t.importBatchId, t.rowNumber)],
);

// ---------------------------------------------------------------------------
// 5.5 Services, tallies, reports
// ---------------------------------------------------------------------------

export const serviceEvents = pgTable(
  "service_events",
  {
    id: id(),
    parishId: uuid("parish_id")
      .notNull()
      .references(() => parishes.id),
    serviceTypeId: uuid("service_type_id")
      .notNull()
      .references(() => serviceTypes.id),
    eventDate: day("event_date").notNull(),
    startTime: time("start_time").notNull(),
    occurrence: smallint("occurrence").notNull().default(1),
    preacher: text("preacher"),
    theme: text("theme"),
    // Set when the event was created by a spreadsheet import (used by undo).
    importBatchId: uuid("import_batch_id").references(() => importBatches.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    unique("service_events_natural_key").on(
      t.parishId,
      t.serviceTypeId,
      t.eventDate,
      t.occurrence,
    ),
    index().on(t.parishId, t.eventDate),
    check("service_events_occurrence_check", sql`${t.occurrence} >= 1`),
  ],
);

export const usherAssignments = pgTable(
  "usher_assignments",
  {
    id: id(),
    serviceEventId: uuid("service_event_id")
      .notNull()
      .references(() => serviceEvents.id, { onDelete: "cascade" }),
    sanctuaryZoneId: uuid("sanctuary_zone_id")
      .notNull()
      .references(() => sanctuaryZones.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    isLead: boolean("is_lead").notNull().default(false),
    checkedInAt: tsz("checked_in_at"),
    ...timestamps,
  },
  (t) => [unique().on(t.serviceEventId, t.userId)],
);

export const zoneTallies = pgTable(
  "zone_tallies",
  {
    id: id(),
    serviceEventId: uuid("service_event_id")
      .notNull()
      .references(() => serviceEvents.id, { onDelete: "cascade" }),
    sanctuaryZoneId: uuid("sanctuary_zone_id")
      .notNull()
      .references(() => sanctuaryZones.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    men: integer("men").notNull().default(0),
    women: integer("women").notNull().default(0),
    children: integer("children").notNull().default(0),
    firstTimers: integer("first_timers").notNull().default(0),
    clientId: uuid("client_id").notNull().unique(),
    clientUpdatedAt: tsz("client_updated_at").notNull(),
    ...timestamps,
  },
  (t) => [
    unique("zone_tallies_natural_key").on(t.serviceEventId, t.sanctuaryZoneId, t.userId),
    check(
      "zone_tallies_non_negative",
      sql`${t.men} >= 0 AND ${t.women} >= 0 AND ${t.children} >= 0 AND ${t.firstTimers} >= 0`,
    ),
  ],
);

export const serviceReports = pgTable(
  "service_reports",
  {
    id: id(),
    serviceEventId: uuid("service_event_id")
      .notNull()
      .unique()
      .references(() => serviceEvents.id, { onDelete: "cascade" }),
    men: integer("men"),
    women: integer("women"),
    children: integer("children"),
    firstTimers: integer("first_timers"),
    workersOnDuty: integer("workers_on_duty"),
    offeringKobo: kobo("offering_kobo"),
    titheKobo: kobo("tithe_kobo"),
    specialSeedKobo: kobo("special_seed_kobo"),
    currency: char("currency", { length: 3 }).notNull().default("NGN"),
    notes: text("notes"),
    source: recordSourceEnum("source").notNull(),
    importBatchId: uuid("import_batch_id").references(() => importBatches.id, {
      onDelete: "set null",
    }),
    status: reportStatusEnum("status").notNull().default("DRAFT"),
    // Null while a TALLY report is only auto-assembled and nobody has saved it yet.
    draftedBy: uuid("drafted_by").references(() => users.id),
    submittedAt: tsz("submitted_at"),
    submittedBy: uuid("submitted_by").references(() => users.id),
    verifiedBy: uuid("verified_by").references(() => users.id),
    verifiedAt: tsz("verified_at"),
    ...timestamps,
  },
  (t) => [
    index().on(t.status),
    index().on(t.importBatchId),
    check(
      "service_reports_non_negative",
      sql`coalesce(${t.men},0) >= 0 AND coalesce(${t.women},0) >= 0 AND coalesce(${t.children},0) >= 0
          AND coalesce(${t.firstTimers},0) >= 0 AND coalesce(${t.workersOnDuty},0) >= 0
          AND coalesce(${t.offeringKobo},0) >= 0 AND coalesce(${t.titheKobo},0) >= 0
          AND coalesce(${t.specialSeedKobo},0) >= 0`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// 5.6 Individual attendance
// ---------------------------------------------------------------------------

export const attendanceCheckins = pgTable(
  "attendance_checkins",
  {
    id: id(),
    serviceEventId: uuid("service_event_id")
      .notNull()
      .references(() => serviceEvents.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (t) => [unique().on(t.serviceEventId, t.memberId), index().on(t.memberId)],
);

// ---------------------------------------------------------------------------
// 5.8 Tasks
// ---------------------------------------------------------------------------

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    parishId: uuid("parish_id")
      .notNull()
      .references(() => parishes.id),
    serviceEventId: uuid("service_event_id").references(() => serviceEvents.id, {
      onDelete: "set null",
    }),
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
    memberId: uuid("member_id").references(() => members.id, { onDelete: "cascade" }),
    kind: taskKindEnum("kind").notNull().default("OPERATIONS"),
    title: text("title").notNull(),
    description: text("description"),
    priority: taskPriorityEnum("priority").notNull().default("MEDIUM"),
    status: taskStatusEnum("status").notNull().default("TODO"),
    // Null when created by the system (follow-up jobs).
    assignedBy: uuid("assigned_by").references(() => users.id),
    assignedTo: uuid("assigned_to")
      .notNull()
      .references(() => users.id),
    dueAt: tsz("due_at").notNull(),
    completedAt: tsz("completed_at"),
    // Makes system-generated tasks idempotent, e.g. "followup:day3:<member>".
    dedupeKey: text("dedupe_key").unique(),
    ...timestamps,
  },
  (t) => [index().on(t.assignedTo, t.status), index().on(t.parishId, t.status)],
);

// ---------------------------------------------------------------------------
// 5.9 Remittance
// ---------------------------------------------------------------------------

export const remittancePolicies = pgTable(
  "remittance_policies",
  {
    id: id(),
    scopeLevel: scopeLevelEnum("scope_level").notNull(),
    scopeId: uuid("scope_id"),
    effectiveFrom: day("effective_from").notNull(),
    parishPct: numeric("parish_pct", { precision: 5, scale: 2 }).notNull(),
    areaPct: numeric("area_pct", { precision: 5, scale: 2 }).notNull(),
    zonePct: numeric("zone_pct", { precision: 5, scale: 2 }).notNull(),
    provincePct: numeric("province_pct", { precision: 5, scale: 2 }).notNull(),
    nationalPct: numeric("national_pct", { precision: 5, scale: 2 }).notNull(),
    ...timestamps,
  },
  (t) => [
    check(
      "remittance_policies_sum_100",
      sql`${t.parishPct} + ${t.areaPct} + ${t.zonePct} + ${t.provincePct} + ${t.nationalPct} = 100`,
    ),
  ],
);

export const remittances = pgTable(
  "remittances",
  {
    id: id(),
    parishId: uuid("parish_id")
      .notNull()
      .references(() => parishes.id),
    periodMonth: day("period_month").notNull(), // first day of the month
    amountDueKobo: kobo("amount_due_kobo").notNull().default(0),
    amountPaidKobo: kobo("amount_paid_kobo").notNull().default(0),
    status: remittanceStatusEnum("status").notNull().default("OUTSTANDING"),
    clearedAt: tsz("cleared_at"),
    ...timestamps,
  },
  (t) => [unique().on(t.parishId, t.periodMonth)],
);

// ---------------------------------------------------------------------------
// 5.10 Messaging & audit
// ---------------------------------------------------------------------------

export const outboundMessages = pgTable(
  "outbound_messages",
  {
    id: id(),
    parishId: uuid("parish_id")
      .notNull()
      .references(() => parishes.id),
    channel: channelEnum("channel").notNull(),
    toPhone: text("to_phone"),
    toEmail: text("to_email"),
    templateKey: text("template_key").notNull(),
    body: text("body").notNull(),
    status: messageStatusEnum("status").notNull().default("QUEUED"),
    relatedMemberId: uuid("related_member_id").references(() => members.id, {
      onDelete: "set null",
    }),
    scheduledFor: tsz("scheduled_for").notNull().defaultNow(),
    sentAt: tsz("sent_at"),
    gatewayResponse: jsonb("gateway_response"),
    dedupeKey: text("dedupe_key").unique(),
    ...timestamps,
  },
  (t) => [index().on(t.status, t.scheduledFor), index().on(t.relatedMemberId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id").notNull(),
    action: text("action").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    at: tsz("at").notNull().defaultNow(),
  },
  (t) => [index().on(t.entity, t.entityId)],
);

// Role assignments are declared last only for readability.
export const roleAssignments = pgTable(
  "role_assignments",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    scopeLevel: scopeLevelEnum("scope_level").notNull(),
    scopeId: uuid("scope_id"),
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "cascade" }),
    smallGroupId: uuid("small_group_id").references(() => smallGroups.id, { onDelete: "cascade" }),
    startsOn: day("starts_on").notNull().default(sql`CURRENT_DATE`),
    endsOn: day("ends_on"),
    ...timestamps,
  },
  (t) => [
    index().on(t.userId),
    check(
      "role_assignments_scope_id_check",
      sql`(${t.scopeLevel} = 'GLOBAL') = (${t.scopeId} IS NULL)`,
    ),
  ],
);


export type Role = (typeof roleEnum.enumValues)[number];
export type ScopeLevel = (typeof scopeLevelEnum.enumValues)[number];
export type ReportStatus = (typeof reportStatusEnum.enumValues)[number];
export type RecordSource = (typeof recordSourceEnum.enumValues)[number];
export type TaskStatus = (typeof taskStatusEnum.enumValues)[number];
export type TaskPriority = (typeof taskPriorityEnum.enumValues)[number];
export type MemberStatus = (typeof memberStatusEnum.enumValues)[number];
export type Milestone = (typeof milestoneEnum.enumValues)[number];
export type RemittanceStatus = (typeof remittanceStatusEnum.enumValues)[number];
