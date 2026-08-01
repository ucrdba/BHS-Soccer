# Walkthrough - Beaumont High School Cougars Soccer Web Platform

The **Beaumont High School Cougars Soccer** web application has been built, configured, and verified. It includes a public sports hub for fans/parents, team rosters with player bios, match schedules, and a **Coach Command Center** featuring **Anson Dorrance's Competitive Matrix** practice rating & planning engine.

---

## 📸 Key Features Built & Verified

### 1. Beaumont Cougars Branding & Public Hub
- **Team Theme**: Built using Beaumont High School's Royal Blue (`#0047AB`), White (`#FFFFFF`), and Deep Navy (`#0A1428`) palette with Oswald & Inter athletic typography.
- **Match Day Countdown**: Live countdown timer for the upcoming game against Yucaipa Thunderbirds.
- **Season Ticker**: Top banner showing match recaps and Citrus Belt League standings.

### 2. Interactive Roster & Player Profiles
- Roster grid filterable by position (Forwards, Midfielders, Defenders, Goalkeepers).
- Player bio cards showing photos, jersey numbers, class years, heights, and season stats.

### 3. Role-Based Privacy & Login Engine (RBAC)
Implemented 4 privilege levels with dynamic role switching:
- **Public Visitor (Guest)**: Has access to public schedules, match recaps, and basic rosters. **Practice ratings & Matrix ranks are strictly locked (`🔒 Private`)**.
- **Player (Alex Rivera #10)**: Signed-in view allows access to team Competitive Matrix rankings, practice schedules, and personal statistics.
- **Coach (Coach Bob)**: Full access to the **Coach Command Center**, **Anson Dorrance Competitive Matrix score logging**, practice planner, and player trait evaluators.
- **Admin (Athletic Director)**: Platform-wide access to manage schools, teams, and accounts.

### 4. Anson Dorrance Competitive Matrix
- Practice competition tracker modeling legendary UNC Coach Anson Dorrance's matrix.
- Tracks 1v1 gauntlets, 2v2 flying scrimmages, fitness tests, and 5v5 scrimmages.
- Calculates dynamic win percentages and overall Matrix Index scores to rank players objectively.

---

## 🧪 Verification Results

| Test Scenario | Role Tested | Result | Verification Notes |
| :--- | :---: | :---: | :--- |
| **Homepage & Hero** | Coach / Guest | **PASS** | Hero banner, countdown timer, and season record display cleanly. |
| **Player Profile (Guest)** | Public Guest | **PASS** | Matrix rank displays `🔒 Private`. Evaluation scores hidden. |
| **Player Profile (Coach)** | Coach Bob | **PASS** | Full technical, tactical, physical, and mental rating breakdown visible. |
| **Matrix Leaderboard** | Player Alex | **PASS** | Player can view team practice ranks & win percentages. |
| **Coach Planner** | Guest / Player | **PASS** | Blocked with restricted access guard for non-coaches. |
| **Add Drill Score** | Coach Bob | **PASS** | Modal opens allowing coaches to record 1v1 scores and update ranks. |

---

## 📂 Summary of Project Files

- [index.html](file:///d:/Source/repos/BHS-Soccer/index.html): Main layout, navbar, top ticker, role-switcher modal, player modal, and drill modal.
- [index.css](file:///d:/Source/repos/BHS-Soccer/index.css): Core design tokens, brand colors, typography, glassmorphism.
- [styles.css](file:///d:/Source/repos/BHS-Soccer/styles.css): Component styles for hero banner, match cards, matrix tables, practice timeline.
- [auth.js](file:///d:/Source/repos/BHS-Soccer/auth.js): Auth manager, role switching engine, RBAC permission guards.
- [app.js](file:///d:/Source/repos/BHS-Soccer/app.js): Application data engine, Beaumont Cougars roster, Anson Dorrance matrix calculation logic, drill bank, practice planner.
