<script setup lang="ts">
/**
 * Administration.
 *
 * The migration's one route that is not a nav view, because the admin panel
 * was never really a modal: several unrelated sections, deep-linkable, and
 * long enough that a dialog fights it. It is reached on purpose rather than
 * browsed to, so it is not in the menu.
 *
 * **The route is coach-or-admin and the sections are gated individually.**
 * Guarding the whole route on `can_access_admin_dashboard` would be tighter
 * and wrong — `schema_roles.sql` grants that to `admin` alone, while the
 * legacy panel shows the categories, the unassigned players and the quiz bank
 * to any coach.
 *
 * And the gate can fail closed for a real admin: `fetchRoles()` returns null
 * when the client is unconfigured or `roles` is unreadable, both entry points
 * then call `setRoles([])`, and every permission reads false. That is the
 * safe direction, but an admin locked out that way is *told* rather than
 * shown an empty page — this panel is exactly where they would come to
 * diagnose it.
 */
import { computed } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useOrganizationStore } from '../stores/organization';
import { can } from '../auth/permissions';
import ApprovalsSection from '../components/admin/ApprovalsSection.vue';
import TeamsSection from '../components/admin/TeamsSection.vue';
import UnassignedPlayersSection from '../components/admin/UnassignedPlayersSection.vue';
import CategoriesSection from '../components/admin/CategoriesSection.vue';
import QuizBankSection from '../components/admin/QuizBankSection.vue';
import SchoolProfileSection from '../components/admin/SchoolProfileSection.vue';
import DiagnosticsSection from '../components/admin/DiagnosticsSection.vue';
import ImportExportSection from '../components/admin/ImportExportSection.vue';

const auth = useAuthStore();
const org = useOrganizationStore();

const isCoach = computed(() => auth.isCoach || auth.isAdmin);
const isAdmin = computed(() => auth.isAdmin);
const schoolId = computed(() => org.school?.id ?? null);
// The profile keys on `schools.code`, not the uuid the other sections take.
const schoolCode = computed(() => org.school?.code ?? null);

/**
 * Whether the admin-only sections may be shown.
 *
 * Both halves matter: the role, and the permission table actually having
 * loaded. They fail for different reasons and want different words.
 */
const mayManage = computed(() => isAdmin.value && can('can_access_admin_dashboard'));
const lockedOut = computed(() => isAdmin.value && !can('can_access_admin_dashboard'));
</script>

<template>
  <section class="admin">
    <header class="admin__head">
      <h1 class="admin__title">Administration</h1>
      <p class="admin__sub">
        Approvals, squads and the shared lists behind the app. What you can
        reach here depends on your role.
      </p>
      <p v-if="org.branding.name" class="admin__org kicker">{{ org.branding.name }}</p>
    </header>

    <ApprovalsSection
      v-if="isCoach"
      :school-id="schoolId" data-admin-approvals />

    <TeamsSection v-if="mayManage" data-admin-manage />

    <!-- Coach-visible, unlike the squads section: soccer_categories_write and
         the membership policies both allow a coach, so these are not controls
         the database would refuse. -->
    <UnassignedPlayersSection
      v-if="isCoach"
      :team-id="org.activeTeamId" :teams="org.teams" data-admin-unassigned />

    <CategoriesSection v-if="isCoach" :school-id="schoolId" data-admin-categories />

    <QuizBankSection
      v-if="isCoach"
      :school-id="schoolId" :teams="org.teams" data-admin-quiz />

    <!-- Not merely hidden: an admin whose roles table did not load would
         otherwise see a page that looks complete and is missing half of
         itself.

         A standalone v-if rather than a v-else-if on the section above:
         `lockedOut` is already a complete condition, and chaining it meant
         inserting a component between the two silently disabled it. -->
    <SchoolProfileSection
      v-if="isAdmin"
      :school-code="schoolCode" :is-admin="isAdmin"
      data-admin-school @saved="org.load()" />

    <ImportExportSection
      v-if="isAdmin"
      :is-admin="isAdmin" :team-id="org.activeTeamId"
      :school-id="schoolId" :school-code="schoolCode"
      :team-name="org.activeTeam?.name ?? null" :teams="org.teams"
      data-admin-importexport />

    <DiagnosticsSection
      v-if="isAdmin"
      :is-admin="isAdmin" :team-id="org.activeTeamId"
      :school-id="schoolId" data-admin-diagnostics />

    <p v-if="lockedOut" class="notice notice--bad" role="alert" data-admin-locked>
      Your account is an administrator, but the permissions table has not
      loaded — so the squad and organization tools are unavailable. That
      usually means the database is unreachable or the <code>roles</code>
      table has not been set up.
    </p>

    <p v-if="!isAdmin" class="notice" data-admin-coach-note>
      Some sections here are for administrators only. Ask yours if you need
      something that is not on this page.
    </p>
  </section>
</template>

<style scoped>
.admin { padding: var(--space-4) var(--space-4) var(--space-8); }

.admin__head { margin-bottom: var(--space-4); padding-bottom: var(--space-3); border-bottom: 1px solid var(--rule); }
.admin__title { font-family: var(--heading-face); font-weight: 500; font-size: 24px; color: var(--ink); }
.admin__sub { margin-top: var(--space-1); max-width: 42rem; color: var(--ink-muted); font-size: 14px; line-height: 1.5; }
.admin__org { margin-top: var(--space-1); }

.notice {
  margin: var(--space-3) 0;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--rule);
  border-left: 4px solid var(--live);
  border-radius: var(--radius-md);
  color: var(--ink-muted);
  font-size: 13px;
  line-height: 1.5;
}
.notice--bad { border-left-color: var(--color-warning); color: var(--ink); }

code { font-size: 0.9em; }

@media (min-width: 768px) { .admin { max-width: 64rem; margin: 0 auto; } }
</style>
