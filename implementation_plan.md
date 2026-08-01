# Implementation Plan - Multi-Tenant Soccer Platform & Coach Command Center

A high-energy, multi-tenant web platform designed for High School Soccer programs (**Beaumont High School Cougars** as primary flagship team), expandable for coaches at other high schools. Includes full Authentication & Role-Based Access Control (RBAC), player profiles, practice planning, and **Anson Dorrance's Competitive Matrix** practice rating engine.

---

## User Review Required

> [!IMPORTANT]
> **Authentication & Role-Based Access Control (RBAC)**
> We will implement an authentication engine supporting 4 user roles:
> 1. **Public / Guest**: Access to public schedules, match recaps, team rosters, and public team highlights.
> 2. **Player**: Sign in to view internal team announcements, personal Anson Dorrance matrix ranking, practice schedule, and personal feedback.
> 3. **Coach**: Sign in to manage school teams (Varsity, JV), manage roster, record competitive drill scores, rank players via Competitive Matrix, create practice plans, and set public vs. private visibility.
> 4. **System Admin**: Manage schools, assign head coaches, configure multi-tenant platform settings.

> [!TIP]
> **Interactive Role Switcher for Demo / Testing**
> The header will feature an interactive **Role Switcher / Sign-In** panel allowing instant switching between **Coach Bob (Beaumont BHS)**, **Player Alex (Varsity #10)**, **Public Visitor**, and **System Admin** to easily test permissions in real-time.

---

## Open Questions

1. **Default Public Visibility**: Should practice matrix rankings be hidden from Public Guests by default, requiring a **Player** or **Coach** login to view full team rankings? *(Recommended: Yes, keep practice rankings private to signed-in team members/coaches)*.

---

## Architecture & Data Model

```
 ┌─────────────────────────────────────────────────────────┐
 │                   Multi-School Platform                 │
 └────────────────────────────┬────────────────────────────┘
                              │
         ┌────────────────────┴────────────────────┐
         │                                         │
┌────────┴────────┐                       ┌────────┴────────┐
│ Beaumont High   │                       │  Other Schools  │
│ (Cougars - BHS) │                       │ (Custom colors) │
└────────┬────────┘                       └─────────────────┘
         │
 ┌───────┴─────────────────────────────────────────────────┐
 │ Roles & Permissions                                      │
 ├────────────────┬─────────────────┬──────────────────────┤
 │ Role           │ Scope           │ Access Rights        │
 ├────────────────┼─────────────────┼──────────────────────┤
 │ Public Guest   │ School Site     │ Roster, Schedule,    │
 │                │                 │ Game Recaps          │
 │ Player         │ Team Portal     │ Announcements, Self  │
 │                │                 │ Stats, Team Matrix   │
 │ Coach          │ Coach Command   │ Practice Planner,    │
 │                │ Center          │ Log Drills, Matrix   │
 │ Admin          │ Global Platform │ Manage Schools &     │
 │                │                 │ Accounts             │
 └────────────────┴─────────────────┴──────────────────────┘
```

---

## Proposed Changes

### 1. Styling & Theme System (`index.css` & `styles.css`)

#### [MODIFY] [index.css](file:///d:/Source/repos/BHS-Soccer/index.css)
- CSS Tokens for School Themes (Dynamic brand colors per school, defaulting to **Beaumont Royal Blue & White** `#0047AB`).
- Glassmorphism auth modals, role indicator badges (`COACH`, `PLAYER`, `ADMIN`, `GUEST`).
- Permissions banner & restricted access guard designs.

---

### 2. Application Core & Auth Engine

#### [MODIFY] [index.html](file:///d:/Source/repos/BHS-Soccer/index.html)
- Main navbar with:
  - School Selector (Beaumont Cougars, rival schools demo).
  - Main Navigation (Home, Roster, Schedule, Practice Center, Coach Portal, Admin Dashboard).
  - Auth Status & Quick Role Switcher Modal.

#### [NEW] [auth.js](file:///d:/Source/repos/BHS-Soccer/auth.js)
- Authentication state manager (current user, active school, active role, permissions check helper).
- `hasPermission(roleRequired, schoolId)` guard functions for routing and component rendering.

#### [MODIFY] [app.js](file:///d:/Source/repos/BHS-Soccer/app.js)
- Multi-tenant data store in `localStorage`:
  - **Schools**: Beaumont High School, + customizable sample school programs.
  - **Teams**: Varsity, JV, Freshmen.
  - **Rosters & Players**: Photos, jersey numbers, positions, stats.
  - **Anson Dorrance Competitive Matrix Engine**:
    - Log practice sessions & competitive drills (1v1, 2v2, Scrimmage, Fitness).
    - Dynamic Matrix Score calculation: $\text{Rank Score} = \text{Win \%} \times 0.7 + \text{Drill Pts} \times 0.3$.
    - Weekly leaderboards with top competitor highlighting.
  - **Practice Planner**: Drill bank (Warm-up, Technical, Competitive 1v1, Small Sided, Cool-down) and daily plan builder.

---

## Permission & Access Matrix

| Feature / Page | Public Guest | Player | Coach | System Admin |
| :--- | :---: | :---: | :---: | :---: |
| **Team Roster & Player Bios** | ✅ View Public | ✅ View All | ✅ Full Edit | ✅ Full Edit |
| **Schedule & Game Recaps** | ✅ View | ✅ View | ✅ Edit Fixtures | ✅ Edit Fixtures |
| **Team Announcements** | ❌ | ✅ View | ✅ Post/Edit | ✅ Post/Edit |
| **Anson Dorrance Matrix Leaderboard** | ❌ *(or Top 3)* | ✅ View Team Ranks | ✅ Full Log & Rank | ✅ Full View |
| **Player Evaluation Ratings** | ❌ | ✅ View Self Only | ✅ Edit All Ratings | ✅ View All |
| **Practice Planner & Drills** | ❌ | ❌ | ✅ Build & Print | ✅ Build & Print |
| **School & User Administration** | ❌ | ❌ | ❌ | ✅ Full Admin |

---

## Verification Plan

### Automated Verification
- Serve application locally (`npx serve .` or Vite dev server) and verify cleanly loads without JS syntax errors.

### Manual Verification
1. **Public View**:
   - Access as Guest -> Verify public Roster & Schedule are readable.
   - Attempt to access Coach Command Center or Practice Planner -> Verify locked guard prompt asking to sign in.
2. **Player Sign-In**:
   - Switch role to **Player (Alex - BHS Varsity)** -> Verify access to Player Portal, team announcements, and personal matrix rank.
   - Verify practice planning buttons remain hidden/disabled.
3. **Coach Sign-In**:
   - Switch role to **Coach Bob (BHS Head Coach)** -> Verify full access to Coach Command Center.
   - Add a new 1v1 practice drill score -> Confirm Competitive Matrix updates player rankings.
   - Build a daily practice plan -> Verify plan saves to team records.
4. **Multi-School Switching**:
   - Switch school context from Beaumont High to another demo school -> Verify roster and data isolate properly per school.
