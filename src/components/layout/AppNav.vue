<script setup lang="ts">
/**
 * The main navigation: a bar on desktop, a drawer under 640px.
 *
 * The items come from NAV_ITEMS, the same list the router is built from, and
 * are filtered through the same routeAllowed() the navigation guard uses. In
 * the legacy app the menu was hand-written <li> elements in index.html that
 * updateAuthUI() hid by setting style.display -- two sources of truth, and an
 * item a visitor could not reach still sat in the document.
 */
import { ref, computed } from 'vue';
import { NAV_ITEMS, routeAllowed } from '../../router';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
const drawerOpen = ref(false);

const visibleItems = computed(() =>
  NAV_ITEMS.filter(item => routeAllowed(item.name, {
    isCoach: () => auth.isCoach,
    isAdmin: () => auth.isAdmin,
    canAccessRatings: () => auth.canAccessRatings
  })));

function toggleDrawer(): void {
  drawerOpen.value = !drawerOpen.value;
}

/** A drawer left open over the page it just navigated to reads as a bug. */
function closeDrawer(): void {
  drawerOpen.value = false;
}
</script>

<template>
  <nav class="nav" aria-label="Main">
    <button
      class="nav__toggle"
      type="button"
      data-nav-toggle
      :aria-expanded="drawerOpen ? 'true' : 'false'"
      aria-controls="nav-items"
      @click="toggleDrawer"
    >
      <span aria-hidden="true">{{ drawerOpen ? '✕' : '☰' }}</span>
      <span class="nav__toggle-label">Menu</span>
    </button>

    <ul
      id="nav-items"
      class="nav__list"
      :class="{ 'is-open': drawerOpen }"
      data-nav-drawer
    >
      <li v-for="item in visibleItems" :key="item.name" class="nav__item">
        <RouterLink
          :to="item.path"
          class="nav__link"
          data-nav-item
          @click="closeDrawer"
        >
          <span class="nav__icon" aria-hidden="true">{{ item.icon }}</span>
          {{ item.label }}
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.nav {
  background: var(--bhs-navy-card);
  border-bottom: 1px solid var(--bhs-navy-border);
  position: sticky;
  top: 0;
  z-index: 40;
}

.nav__toggle {
  display: none;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.85rem 1rem;
  background: none;
  border: 0;
  color: var(--bhs-cyan-accent);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.nav__list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin: 0;
  padding: 0 1rem;
  list-style: none;
}

.nav__link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.85rem 0.9rem;
  color: var(--text-muted, #94a3b8);
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 600;
  white-space: nowrap;
  border-bottom: 2px solid transparent;
}

.nav__link:hover,
.nav__link:focus-visible {
  color: #fff;
}

/* router-link-active is applied by Vue Router to the current route. */
.nav__link.router-link-exact-active {
  color: var(--bhs-cyan-accent);
  border-bottom-color: var(--bhs-cyan-accent);
}

.nav__icon {
  font-size: 1rem;
}

/*
 * Under 640px the bar becomes a drawer. What this replaced was a strip that
 * scrolled sideways with its scrollbar hidden -- the items past the edge were
 * there and nothing on screen said so.
 */
@media (max-width: 640px) {
  .nav__toggle { display: flex; }

  .nav__list {
    display: none;
    flex-direction: column;
    padding: 0 0 0.5rem;
  }

  .nav__list.is-open { display: flex; }

  .nav__link {
    width: 100%;
    padding: 0.9rem 1.25rem;
    border-bottom: 1px solid var(--bhs-navy-border);
  }

  .nav__link.router-link-exact-active {
    border-bottom-color: var(--bhs-navy-border);
    border-left: 3px solid var(--bhs-cyan-accent);
  }
}
</style>
