/**
 * Routing for the Vue app.
 *
 * Minimal for Task 1, whose only job is proving the toolchain builds. The
 * seven nav routes and their guards land in Task 3.
 */
import { createRouter, createWebHistory, type Router } from 'vue-router';

export const router: Router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: { template: '<section />' } }
  ]
});
