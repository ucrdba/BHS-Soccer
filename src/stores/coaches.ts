/**
 * The coaching staff, and the accounts waiting to be let in.
 *
 * The staff list takes the organization explicitly. `fetchCoaches` and
 * `upsertCoach` both declare `schoolId: string = 'bhs'`, so a bare call shows
 * a club coach Beaumont's staff — which is exactly what app.core.js:523 does
 * today. `loadPending` needs no such argument: `pending_requests()` decides
 * who sees what from the caller's own identity, not from a school id passed
 * in.
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { supabaseService } from '../data/supabase';
import { auth } from '../auth';
import { toCoaches, sortedCoaches, type Coach } from '../domain/coach-row';
import type { PendingRequest } from '../types';

export interface CoachForm {
  /** NOT NULL in the database. */
  name: string;
  /** NOT NULL in the database. */
  level: string;
  phone?: string;
  address?: string;
  email?: string;
  photo?: string;
  bio?: string;
}

export interface WriteResult { ok: boolean; error?: string }

export const useCoachesStore = defineStore('coaches', () => {
  const coaches = ref<Coach[]>([]);
  const pending = ref<PendingRequest[]>([]);
  const loading = ref(false);
  const loadError = ref<string | null>(null);
  const loadedSchoolId = ref<string | null>(null);

  const staff = computed(() => sortedCoaches(coaches.value));

  async function load(schoolId: string | null): Promise<void> {
    if (!schoolId) { coaches.value = []; loadedSchoolId.value = null; return; }
    loading.value = true;
    loadError.value = null;
    try {
      coaches.value = toCoaches(await supabaseService.fetchCoaches(schoolId));
      loadedSchoolId.value = schoolId;
    } catch (err: any) {
      loadError.value = err?.message || 'Could not load the coaching staff.';
      console.error('Coaches load failed:', err);
    } finally {
      loading.value = false;
    }
  }

  /**
   * The requests this viewer may act on, for the count and the link.
   * pending_requests() decides who sees what; the page does not approve
   * anything itself -- one queue, in the admin panel, rather than two that drift.
   */
  async function loadPending(): Promise<void> {
    if (!(auth.isCoach() || auth.isAdmin())) { pending.value = []; return; }
    pending.value = (await supabaseService.fetchPendingRequests()) || [];
  }

  function validate(f: CoachForm): string | null {
    // Both are NOT NULL. upsertCoach would quietly substitute 'Coach' and
    // 'Staff' for blanks, which puts a person called "Coach" on the page.
    if (!String(f.name || '').trim()) return 'A name is required.';
    if (!String(f.level || '').trim()) return 'A role is required.';
    return null;
  }

  function payload(f: CoachForm): Record<string, any> {
    return {
      name: f.name.trim(),
      level: f.level.trim(),
      phone: (f.phone || '').trim(),
      address: (f.address || '').trim(),
      email: (f.email || '').trim(),
      // Stored empty rather than defaulted to a stock photo: assigning a
      // random stranger's face makes a coach without a photo look like they
      // have one. The view renders the silhouette placeholder instead.
      photo: (f.photo || '').trim(),
      bio: (f.bio || '').trim()
    };
  }

  async function addCoach(f: CoachForm, schoolId: string): Promise<WriteResult> {
    if (!schoolId) return { ok: false, error: 'No organization resolved.' };
    const invalid = validate(f);
    if (invalid) return { ok: false, error: invalid };

    const saved = await supabaseService.upsertCoach(schoolId, payload(f));
    if (!saved?.id) return { ok: false, error: 'Could not save that coach.' };

    await load(schoolId);
    return { ok: true };
  }

  async function updateCoach(id: string, f: CoachForm, schoolId: string): Promise<WriteResult> {
    if (!schoolId) return { ok: false, error: 'No organization resolved.' };
    const invalid = validate(f);
    if (invalid) return { ok: false, error: invalid };

    const saved = await supabaseService.upsertCoach(schoolId, { id, ...payload(f) });
    if (!saved?.id) return { ok: false, error: 'Could not save that coach.' };

    await load(schoolId);
    return { ok: true };
  }

  /**
   * Remove a coach, then check whether it worked.
   *
   * `deleteCoach` logs its error and returns nothing at all, so its return
   * value cannot distinguish success from failure. Rather than reporting a
   * success we have not verified, this reloads and looks: if the row is still
   * there, the delete was refused — most likely by RLS.
   */
  async function removeCoach(id: string, schoolId: string): Promise<WriteResult> {
    if (!schoolId) return { ok: false, error: 'No organization resolved.' };

    await supabaseService.deleteCoach(id);
    await load(schoolId);

    if (coaches.value.some(c => c.id === id)) {
      return { ok: false, error: 'That coach could not be removed. You may not have permission.' };
    }
    return { ok: true };
  }

  return {
    coaches, pending, loading, loadError, loadedSchoolId, staff,
    load, loadPending, addCoach, updateCoach, removeCoach
  };
});
