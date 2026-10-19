"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/forms";
import type { Role, ScopeLevel } from "@/lib/db/schema";
import { ROLE_LABELS } from "@/lib/labels";
import { addRoleAssignment } from "../../actions";

type Opt = { id: string; name: string };
export type ScopeData = {
  regions: Opt[];
  provinces: Opt[];
  zones: Opt[];
  areas: Opt[];
  parishes: Opt[];
  departments: (Opt & { parishId: string })[];
  groups: (Opt & { parishId: string })[];
};

const LEVEL_FOR: Record<Role, ScopeLevel> = {
  USHER: "PARISH",
  HEAD_USHER: "PARISH",
  SECRETARY: "PARISH",
  HOD: "PARISH",
  TRIBE_LEADER: "PARISH",
  PARISH_PASTOR: "PARISH",
  AREA_PASTOR: "AREA",
  ZONAL_PASTOR: "ZONE",
  PROVINCIAL_ADMIN: "PROVINCE",
  SYSTEM_ADMIN: "GLOBAL",
};

export function RoleGrantForm({ userId, roles, scopes, today }: { userId: string; roles: Role[]; scopes: ScopeData; today: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addRoleAssignment, {});
  const [role, setRole] = useState<Role>(roles[0]);
  const [parishId, setParishId] = useState(scopes.parishes[0]?.id ?? "");
  const level = LEVEL_FOR[role];
  const scopeList: Opt[] = useMemo(
    () => ({ PARISH: scopes.parishes, AREA: scopes.areas, ZONE: scopes.zones, PROVINCE: scopes.provinces, REGION: scopes.regions, GLOBAL: [] })[level],
    [level, scopes],
  );
  useEffect(() => {
    if (!state.at) return;
    if (state.ok) toast.success(state.message ?? "Saved");
    else if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="scopeLevel" value={level} />
      <div className="space-y-1.5">
        <Label htmlFor="role">Role</Label>
        <select id="role" name="role" value={role} onChange={(e) => setRole(e.target.value as Role)} className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm">
          {roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      {level !== "GLOBAL" && (
        <div className="space-y-1.5">
          <Label htmlFor="scopeId">{level === "PARISH" ? "Parish" : level.charAt(0) + level.slice(1).toLowerCase()}</Label>
          <select
            id="scopeId"
            name="scopeId"
            key={level}
            defaultValue={level === "PARISH" ? parishId : scopeList[0]?.id}
            onChange={(e) => level === "PARISH" && setParishId(e.target.value)}
            className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm"
          >
            {scopeList.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {role === "HOD" && (
        <div className="space-y-1.5">
          <Label htmlFor="departmentId">Department</Label>
          <select id="departmentId" name="departmentId" className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm">
            {scopes.departments.filter((d) => d.parishId === parishId).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {role === "TRIBE_LEADER" && (
        <div className="space-y-1.5">
          <Label htmlFor="smallGroupId">Tribe</Label>
          <select id="smallGroupId" name="smallGroupId" className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm">
            {scopes.groups.filter((g) => g.parishId === parishId).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="startsOn">Starts</Label>
        <input id="startsOn" name="startsOn" type="date" defaultValue={today} className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="endsOn">Ends (optional)</Label>
        <input id="endsOn" name="endsOn" type="date" className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm" />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-danger-text sm:col-span-2">
          {state.error}
        </p>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending} className="h-11">
          {pending ? "Adding…" : "Add role"}
        </Button>
      </div>
    </form>
  );
}
