<script setup lang="ts">
/**
 * The main navigation: a bottom bar on a phone, a hairline top nav on a desk.
 *
 * The items come from NAV_ITEMS, the same list the router is built from, and
 * are filtered through the same routeAllowed() the navigation guard uses, so
 * an item a visitor cannot reach is not in the document at all.
 *
 * Under 768px the bar holds five. `barItems` decides which sit in it and
 * which go behind More. Above 768px every item is in the bar and the More tab
 * and the sheet are display:none; the bar renders every item once, with the
 * overflowed ones marked, so the split is a matter of CSS rather than two
 * lists.
 *
 * Every item comes from NAV_ITEMS, admin included. Admin used to be appended
 * to the sheet on its own, which made it unreachable by clicking above 768px,
 * where the sheet is hidden -- so the one screen only a coach or admin can
 * open was the one screen they could not navigate to.
 */
import { ref, computed, nextTick } from 'vue';
import { NAV_ITEMS, routeAllowed, type NavItem } from '../../router';
import { barItems } from '../../domain/nav-bar';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
const sheetOpen = ref(false);

const visibleItems = computed(() =>
  NAV_ITEMS.filter(item => routeAllowed(item.name, {
    isCoach: () => auth.isCoach,
    isAdmin: () => auth.isAdmin,
    canAccessRatings: () => auth.canAccessRatings
  })));

const split = computed(() => barItems(visibleItems.value));
const overflowNames = computed(() => new Set(split.value.overflow.map(i => i.name)));
const hasMore = computed(() => split.value.overflow.length > 0);

/** The admin screen is reached on purpose; it lives in the sheet, not the bar. */

function isOverflow(item: NavItem): boolean {
  return overflowNames.value.has(item.name);
}

const toggleEl = ref<HTMLButtonElement | null>(null);
const sheetEl = ref<HTMLElement | null>(null);

/**
 * Opening the sheet moves focus into it; closing it gives focus back to the
 * toggle. Without this a keyboard user opens the sheet and is still standing
 * on the More tab with the links somewhere behind them.
 */
async function toggleSheet(): Promise<void> {
  sheetOpen.value = !sheetOpen.value;
  await nextTick();
  if (sheetOpen.value) {
    sheetEl.value?.querySelector<HTMLElement>('[data-nav-sheet-item]')?.focus();
  } else {
    toggleEl.value?.focus();
  }
}

/** A sheet left open over the page it just navigated to reads as a bug. */
function closeSheet(): void {
  sheetOpen.value = false;
}

/** Escape closes the sheet and returns focus, the way a dialog does. */
async function onSheetKeydown(e: KeyboardEvent): Promise<void> {
  if (e.key !== 'Escape') return;
  closeSheet();
  await nextTick();
  toggleEl.value?.focus();
}
</script>

<template>
  <nav class="nav" aria-label="Main">
    <ul class="nav__bar">
      <li
        v-for="item in visibleItems" :key="item.name"
        class="nav__item" :class="{ 'nav__item--overflow': isOverflow(item) }"
      >
        <RouterLink
          :to="item.path"
          class="nav__link"
          :title="item.label"
          data-nav-item
          :data-nav-overflow="isOverflow(item) ? '' : undefined"
          :data-nav-admin="item.name === 'admin' ? '' : undefined"
          @click="closeSheet"
        >{{ item.short }}</RouterLink>
      </li>

      <li v-if="hasMore" class="nav__item nav__item--more">
        <button
          ref="toggleEl"
          type="button"
          class="nav__link nav__more"
          data-nav-toggle
          :aria-expanded="sheetOpen ? 'true' : 'false'"
          aria-controls="nav-more"
          @click="toggleSheet"
        >More</button>
      </li>
    </ul>

    <div
      v-if="hasMore"
      ref="sheetEl"
      id="nav-more"
      class="sheet"
      :class="{ 'is-open': sheetOpen }"
      data-nav-drawer
      @keydown="onSheetKeydown"
    >
      <div class="sheet__backdrop" data-nav-backdrop @click="closeSheet" />
      <ul class="sheet__list">
        <li v-for="item in split.overflow" :key="item.name" class="sheet__item">
          <RouterLink
            :to="item.path" class="sheet__link" :title="item.label"
            data-nav-sheet-item :data-nav-admin="item.name === 'admin' ? '' : undefined"
            @click="closeSheet"
          >{{ item.short }}</RouterLink>
        </li>
      </ul>
    </div>
  </nav>
</template>

<style scoped>
/* ── The bar ── */

.nav__bar {
  display: flex;
  margin: 0;
  padding: 0;
  list-style: none;
}

.nav__item { flex: 1; min-width: 0; }

.nav__link {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 48px;
  padding: 0 var(--space-2);
  border: 0;
  border-top: 2px solid transparent;
  background: none;
  color: var(--ink-muted);
  font-family: var(--font-body);
  font-size: 10px;
  line-height: 1.3;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
}

.nav__link:hover,
.nav__link:focus-visible { color: var(--ink); }

/* router-link-exact-active is applied by Vue Router to the current route. */
.nav__link.router-link-exact-active {
  color: var(--ink);
  border-top-color: var(--live);
}

/*
 * Under 768px: fixed to the bottom, on the surface, with the overflowed
 * items hidden and the More tab shown. The safe-area inset keeps the bar
 * above a phone's home indicator.
 */
@media (max-width: 767.98px) {
  .nav {
    position: fixed;
    inset: auto 0 0 0;
    z-index: 40;
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--surface);
    border-top: 1px solid var(--rule);
  }

  .nav__item--overflow { display: none; }
}

/* 768px and above: a hairline top nav, every item in a row, no More. */
@media (min-width: 768px) {
  .nav {
    position: sticky;
    top: 0;
    z-index: 40;
    background: var(--ground);
    border-bottom: 1px solid var(--rule);
  }

  .nav__bar {
    gap: var(--space-4);
    max-width: 64rem;
    margin: 0 auto;
    padding: 0 var(--space-4);
  }

  .nav__item { flex: none; }

  .nav__link {
    min-height: 44px;
    padding: 0;
    border-top: 0;
    border-bottom: 1px solid transparent;
    font-size: 14px;
  }

  .nav__link.router-link-exact-active {
    border-top-color: transparent;
    border-bottom-color: var(--live);
    color: var(--live);
  }

  .nav__item--more,
  .sheet { display: none; }
}

/* ── The More sheet ── */

.sheet {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: none;
}

.sheet.is-open { display: block; }

.sheet__backdrop {
  position: absolute;
  inset: 0;
  background: var(--scrim);
}

.sheet__list {
  position: absolute;
  inset: auto 0 0 0;
  margin: 0;
  padding: var(--space-2) 0 calc(var(--space-8) + 48px + env(safe-area-inset-bottom));
  list-style: none;
  background: var(--surface);
  border-top: 1px solid var(--rule);
  box-shadow: var(--shadow-md);
}

.sheet__link {
  display: block;
  padding: var(--space-3) var(--space-4);
  color: var(--ink);
  font-size: 15px;
  text-decoration: none;
  border-bottom: 1px solid var(--rule);
}

.sheet__link:hover,
.sheet__link:focus-visible { background: color-mix(in srgb, var(--ink) 6%, transparent); }

.sheet__link.router-link-exact-active { color: var(--live); }
</style>
