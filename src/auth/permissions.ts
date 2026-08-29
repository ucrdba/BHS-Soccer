import { auth } from '../auth';

export type PermissionKey =
  | 'can_view_roster' | 'can_modify_roster'
  | 'can_view_schedule' | 'can_modify_schedule'
  | 'can_view_ratings' | 'can_modify_ratings'
  | 'can_view_planner' | 'can_modify_planner'
  | 'can_view_coaches' | 'can_modify_coaches'
  | 'can_manage_users' | 'can_manage_roles' | 'can_manage_schools'
  | 'can_import_export' | 'can_access_admin_dashboard';

export interface RoleRow {
  name: string;
  permissions: Partial<Record<PermissionKey, boolean>>;
}

/** Pure form, for testing. Fails closed on unknown role or unloaded table. */
export function canFor(roles: RoleRow[], roleName: string, key: PermissionKey): boolean {
  const role = roles.find(r => r.name === roleName);
  return role ? role.permissions[key] === true : false;
}

let loaded: RoleRow[] = [];

export function setRoles(rows: RoleRow[]): void {
  loaded = rows;
}

export function can(key: PermissionKey): boolean {
  return canFor(loaded, auth.getRole(), key);
}
