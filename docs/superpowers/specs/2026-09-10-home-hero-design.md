# Home: the organization's photo band

**Date:** 2026-09-10
**Status:** approved in brainstorming, section by section. Awaiting review of this written form.
**Amends:** `2026-09-07-mobile-restyle-design.md`, §2.3 (organization colours) and §5.1 (Home).

## 1. Why

The home page is the program's public face. A visitor, signed out, currently
gets one small fixture block and a mostly empty page:

- The restyle drew Home mid-season, with a last result, the record strip and
  the coach's message. Preseason, none of those exist yet. The schedule has
  19 fixtures and nothing played.
- Since `a6997c8`, visitors no longer see the coach's message, which was the
  page's largest block.
- The organization's identity barely appears. The header mark is a letter in
  a box, and the organization's colour is used only for hairlines.

## 2. Decisions

Settled in brainstorming, in this order:

| Question | Decision |
| --- | --- |
| Who the page is for | **Visitors first.** Signed-in players, coaches and admins get the same page plus the coach's message. |
| What a visitor gets | **Who we are, what's coming up, how we're doing.** "Getting to the match" was not chosen. |
| Direction | **B, a photo band**, over A (stay within the restyle's lines-only rules) and C (a solid colour band). C survives as B's fallback. |
| The photo | `assets/beaumont_soccer_goalkeeper.jpg`, **as a placeholder** the user will replace with a real team photo. |
| Where the words sit | **Bottom-left, at every width.** A photo works best with its subject in the upper or right part of the frame. |

The placeholder is AI-generated. That was raised, and the user chose to keep
it until a real photo replaces it. A real photo of the squad shows minors, so
it should be checked against the school's media-release rules before
publishing. The Photo address field makes the swap a data change, not a
code change.

## 3. Layout

Top to bottom, on the `paper` ground:

1. **Header and navigation:** unchanged.
2. **The band** (§4). The organization's photo, or its colour. The top-left
   holds the logo and the league and city. The bottom-left holds the next
   match: home or away, the opponent large, the countdown, then the date and
   kick-off.
3. **The coach's message:** signed-in viewers only, straight after the band,
   as today's `DailyThought` card, unchanged.
4. **Coming up:** up to three fixtures after the next one, each a hairline
   row with date, opponent, and an outlined Home or Away pill. Then a link,
   "All N fixtures →", to `/schedule`, where N is every fixture on the
   schedule. The section is hidden when nothing follows the next match.
5. **How we're doing:**
   - **Before any result:** one line, "Season opens <date of next match> ·
     N fixtures". Hidden when there is no next match and no results.
   - **Once results exist:** the last result ("Last out · El Toro, away" with
     "Won 2–1"), the form over the last five results, and the four figures
     the page already shows (record, played, goals per game, clean sheets).

**On a computer (768px and wider):** the band runs edge to edge, 320px tall,
and its words line up with the header's left edge rather than the centred
column. A band four times wider than it is tall shows the photo at full width,
so the photo can only move up and down. Centred words would cover the subject
of any photo composed around its middle. Below the band, the page keeps the
centred column the rest of the app uses. "Coming up" and the season sit side
by side.

**On a phone:** the band is 300px tall. The words are inset 16px from the
left.

Removed: the old fixture block, and the visitor-only logo `figure` added in
`a6997c8`. The band now shows the logo to everyone.

## 4. The band

### 4.1 What fills it, in order of preference

| Situation | Band shows |
| --- | --- |
| A photo address is set, it passes `safeImageUrl`, and it loads | The photo, shaded (§4.2) |
| No address, a refused address, or a photo that fails to load | A solid band in `--org-band` |
| The organization's primary colour is below 4.5:1 against white text | `--org-band` resolves to `#0A1428`, the dark grounds' navy |

A photo that fails to load is tracked by its address, not a flag, so
correcting the address brings it back without a reload. This matches the
logo's handling in `8f7d13b`.

### 4.2 Shading

Two layers keep the words readable whatever the photo:

- **Band-wide:** darkens the top edge behind the logo line, stays clear
  through the upper-middle where a subject usually is, then deepens from just
  below the middle to near-solid at the bottom.
- **Corner:** a radial shade centred on the bottom-left, where the words are.

The small text (the league line, "Next match · Away", the date line) also gets
a soft text shadow.

### 4.3 Framing

The photo is `object-fit: cover` with defaults that suit a subject in the
upper-middle:

- phone: `object-position: 50% 50%`, so the band crops the photo at the
  sides;
- computer: `object-position: 50% 25%`, so the band shows a horizontal strip,
  kept high to hold hands and faces.

The goalkeeper placeholder was checked in the brainstorming companion,
with the computer band drawn at its true 4:1 proportion. The phone crop was
shifted to `57% 50%` to centre the keeper, and the computer crop sat at
`50% 24%`. The keeper's hands, head and body stayed in frame and the words
sat clear of him. The rounded defaults above are within ten pixels of those
at phone size, and the build re-checks them on the real page.

### 4.4 The countdown

| Time to kick-off | Reads | Read aloud as |
| --- | --- | --- |
| A day or more | "88 days 21 hrs" | "88 days and 21 hours until kick-off" |
| Under a day | "4 hrs 12 min" | "4 hours and 12 minutes until kick-off" |
| Under an hour | "12 min" | "12 minutes until kick-off" |
| Kick-off passed, match still the next one | "Under way" | "Under way" |

Units are singular at one: "1 day", "1 hr", "1 min". The numbers are in the
heading face, large, and the units small. When the date cannot be parsed there
is no countdown, only the date text.

### 4.5 When there is no next match

The band shows today's wording where the opponent would be: "Schedule coming
soon", "No upcoming fixtures", or "Season complete". While the schedule loads
it reads "Loading the schedule…". A schedule load error keeps today's
warning box, directly under the band.

## 5. Where the photo comes from

- **Storage:** `schools.hero_url text`, nullable, added by
  `supabase/migrations/0030_school_hero.sql`. Same shape as `0028`: `set role
  postgres`, `add column if not exists`, a column comment, safe to run twice.
- **Reading:** `brandingFor` gains `heroUrl`, passed through `safeImageUrl`,
  with no fallback. An organization without a photo shows its colour, never
  somebody else's photo.
- **Before 0030 is applied:** `fetchSchools` and `fetchSchool` select `*`, so
  the column is simply absent and the band shows the colour. The client can
  ship first.
- **Writing:** `upsertSchool` sends `hero_url` only when `heroUrl` is supplied.
  The profile form supplies it only when the row it loaded has the column,
  because naming a missing column makes PostgREST refuse the whole save with
  `42703`.
- **Setting it:** a "Photo address" field in Admin → Organization profile,
  beside "Logo address", with the same behaviour: disabled with a note until
  0030 is applied, refuses addresses `safeImageUrl` rejects, previews after a
  400ms pause, and warns but still saves when the image does not load. Its
  hint says the subject should sit in the upper or right part of the photo.
- **The placeholder file:** `public/img/bhs-hero.jpg`, from
  `assets/beaumont_soccer_goalkeeper.jpg`, 1264×848, JPEG quality 82,
  progressive, about 264 KB. It is hosting only: no code refers to it, and
  Beaumont's row points at it. `assets/` is not copied into `dist/`, which is
  why it lives in `public/`.

## 6. Components and logic

### 6.1 Components

| File | Holds |
| --- | --- |
| `src/components/home/HomeHero.vue` (new) | The band: photo or colour, both shades, the logo and league line, the next match, the countdown, the no-fixture wording. Owns both image failures: a photo that fails falls back to the colour band, and a logo that fails is hidden. Presentational; takes everything as props. |
| `src/components/home/ComingUp.vue` (new) | Up to three fixtures and the "All N fixtures" link. |
| `src/components/home/SeasonSummary.vue` (new) | The preseason line, or the last result, form and the four figures. |
| `src/views/HomeView.vue` | Composition only: turns the stores and the domain functions into props for the three components and `DailyThought`. It is 284 lines today, and the fixture and stats markup moves out of it. |
| `src/components/admin/ImageAddressField.vue` (new) | The logo field's behaviour, extracted and used twice, for Logo address and Photo address. It keeps the `data-school-logo*` hooks so the existing logo tests keep proving it, and hero hooks follow the same pattern. |
| `src/components/admin/SchoolProfileSection.vue` | Uses `ImageAddressField` twice. It still refuses to save while either address is refused. |

### 6.2 Domain functions

All framework-free and tested directly.

- **`src/domain/schedule.ts`**
  - `upcomingMatches(schedule, now)` returns the dated, not-completed
    fixtures still ahead, inside the existing grace period, in date order.
    `getNextMatch` becomes its first entry, keeping the undated fallback, so
    "next match" and "coming up" cannot disagree.
  - `longCountdown(c)` returns `null` when there is no countdown, and
    otherwise `{ parts, spoken, underway }`, following §4.4. `parts` is a
    list of `{ value, unit }`. At zero, `underway` is true, `parts` is empty
    and `spoken` is "Under way".
- **`src/domain/schedule-view.ts`**
  - `recentForm(schedule, n = 5)` returns the last `n` completed fixtures
    with a readable outcome, oldest first, as `'W' | 'D' | 'L'`, through the
    existing `matchOutcome`. A result whose score cannot be read is skipped,
    never counted as a draw.
- **`src/domain/theme.ts`**
  - `safeLogoUrl` is renamed `safeImageUrl`, with the same rule: http(s), or
    a root-relative path that is not protocol-relative.
  - `Branding` gains `heroUrl`.
  - `themeVars` gains `--org-band`: the primary colour when
    `contrastRatio(primary, '#ffffff') >= MIN_TEXT_CONTRAST`, otherwise
    `#0A1428`.

### 6.3 Tokens

In `index.css`, not component styles. `design-tokens.test.ts` forbids a white
literal in any component style.

| Token | Where | Holds |
| --- | --- | --- |
| `--org-band` | `:root` cold-load fallback, beside the other organization properties | `#0047AB`, the default primary. It passes the 4.5:1 check against white. |
| `--band-ink` | `:root` | The band's text, white |
| `--band-ink-muted` | `:root` | The band's secondary text, white at 85% |
| `--band-shade` | `:root` | The band-wide gradient in §4.2 |
| `--band-corner` | `:root` | The corner shade in §4.2 |
| `--band-text-shadow` | `:root` | The small text's shadow |

### 6.4 The exception to the restyle

The restyle's §2.3 says organization colours are "used only as stroke, never
as fill or body text". The band is a fill, and the one exception, on Home
only. `2026-09-07-mobile-restyle-design.md` gains a line at §2.3 and a note at
§5.1 pointing here, so nobody later "fixes" the band back to hairlines.

## 7. Performance and accessibility

- The photo is the page's largest element, so it gets `fetchpriority="high"`
  and `decoding="async"`. The band has a fixed height, so nothing shifts while
  the photo loads.
- The photo is decorative (`alt=""`). The logo keeps the organization's name
  as its alternative text.
- White text sits on a shaded photo or on a colour guarded to 4.5:1.
- The countdown carries its spoken form as an accessible label (§4.4).
- Form letters carry the result. Colour only reinforces them.

## 8. Testing

Every change passes the three gates by exit code: `npm test`,
`npm run typecheck`, `npm run build`.

- **Domain:**
  - `upcomingMatches`: order, the grace period, completed fixtures
    excluded, undated rows, and that `getNextMatch` is its first entry.
  - `longCountdown`: the three forms, singulars, "Under way", and `null`.
  - `recentForm`: oldest first, capped at `n`, only completed fixtures,
    unreadable scores skipped.
  - `safeImageUrl`: the existing `safeLogoUrl` cases, renamed.
  - `themeVars['--org-band']`: navy passes, a light colour such as yellow
    falls back to `#0A1428`, junk falls back.
- **Components:**
  - `HomeHero`:
    - a photo shown, and a failed photo falls back to the band
    - the band returning to the photo when the address changes
    - a failed logo hidden
    - the league line omitted with neither league nor city
    - the no-fixture wordings, "Loading the schedule…", and "Under way"
    - the countdown's spoken label
  - `ComingUp`: at most three rows, hidden when empty, the link and its
    count.
  - `SeasonSummary`: the preseason line against results, and the form letters.
  - `HomeView`: the coach's message for signed-in viewers only, and the
    visitor logo `figure` gone.
  - `ImageAddressField`: the existing logo tests unchanged and passing,
    and the same cases for the photo field.
- **Tokens:** `--org-band` has a cold-load fallback. The existing "no white
  literal in component styles" test covers the new components.
- **Database:** `src/data/testdb/school-hero.test.ts` runs 0030 against a real
  Postgres. The column is absent before, nullable text after, existing
  organizations are untouched and get no photo, and running it twice is
  harmless.
- **Browser:**
  - `localhost` at phone and computer widths with real data.
  - Until 0030 is applied to the live database, the page itself exercises
    the colour-band fallback. After it is applied and Beaumont's address is
    set, the photo.

## 9. Rollout

1. Merge the client. It works before the migration, showing the colour band.
2. Apply `0030_school_hero.sql` in the Supabase SQL editor.
3. Set Beaumont's photo, either in Admin → Organization profile → Photo
   address (`/img/bhs-hero.jpg`), or:
   `update public.schools set hero_url = '/img/bhs-hero.jpg' where code = 'bhs';`
4. Replace the placeholder with a real team photo when one is available,
   through the same field.

`CLAUDE.md`'s migration list is extended to `0030`.

## 10. Out of scope

- **A per-photo focus point.** The defaults in §4.3 suit a subject in the
  upper-middle. If a replacement photo needs a different crop, a
  `hero_position` beside `hero_url` is the follow-up.
- **Uploading images.** Addresses only, as for the logo.
- **Restyling the coach's message** as a pull-quote.
- **The header's crest mark,** still a letter in a keyline.
- **Responsive image variants** (`srcset`). One 1264px file serves both widths.
