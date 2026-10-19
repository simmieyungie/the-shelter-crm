import type { MemberStatus, Milestone, Role, TaskPriority, TaskStatus } from "@/lib/db/schema";

export const ROLE_LABELS: Record<Role, string> = {
  USHER: "Usher",
  HEAD_USHER: "Head Usher",
  SECRETARY: "Secretary",
  HOD: "Head of Department",
  TRIBE_LEADER: "Tribe Leader",
  PARISH_PASTOR: "Parish Pastor",
  AREA_PASTOR: "Area Pastor",
  ZONAL_PASTOR: "Zonal Pastor",
  PROVINCIAL_ADMIN: "Provincial Admin",
  SYSTEM_ADMIN: "System Admin",
};

export const SCOPE_LABELS = {
  PARISH: "Parish",
  AREA: "Area",
  ZONE: "Zone",
  PROVINCE: "Province",
  REGION: "Region",
  GLOBAL: "Everywhere",
} as const;

export const RECURRENCE_LABELS = {
  WEEKLY: "Every week",
  MONTHLY_FIRST_FRIDAY: "First Friday of the month",
  SPECIAL: "Special (no fixed day)",
} as const;

export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  FIRST_TIMER: "First-timer",
  NEW_CONVERT: "New convert",
  REGULAR_MEMBER: "Member",
  WORKER: "Worker",
  ORDAINED_MINISTER: "Ordained minister",
};

export const MILESTONE_LABELS: Record<Milestone, string> = {
  WATER_BAPTISM: "Water baptism",
  HOLY_GHOST_BAPTISM: "Holy Ghost baptism",
  BELIEVERS_CLASS: "Believers' class",
  WORKERS_IN_TRAINING: "Workers in training",
  SCHOOL_OF_DISCIPLES: "School of Disciples",
  RCBC: "RCBC",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "For review",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};
