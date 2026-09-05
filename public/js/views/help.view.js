/**
 * The in-app coach's handbook.
 *
 * A seventh view alongside home/roster/schedule/matrix/planner/coaches, and
 * the only one visible to a guest that is not about the team itself — a player
 * who cannot work out the quiz, or a parent wondering what the ratings mean,
 * should not have to sign in to read the manual.
 *
 * Classic script: no imports, extends the prototype defined in app.core.js, so
 * index.html must load this AFTER that file.
 *
 * Search and the index are wired by initHelpView(), which app.core.js calls on
 * a setTimeout once the HTML has landed — the same pattern the planner uses to
 * re-initialise the tactical canvas. Building the index from the rendered DOM
 * rather than from a hand-kept list means a section added below cannot be
 * forgotten in the contents.
 */
Object.assign(BHSSoccerApp.prototype, {

  renderHelpView() {
    // Sections are ordered by when a coach MEETS them, not by how the app is
    // structured: sign in, the weekly work, the matrix, practice, then running
    // the program. `part` groups them in the index; `roles` renders the chips,
    // because who may do a thing is the first question a coach asks.
    const sections = this.helpSections();

    return `
      <section class="view-section">
        <div class="section-header">
          <h2 class="section-title">📖 COACH'S HANDBOOK</h2>
          <p class="text-muted">Everything the program's software does, in the order you will meet it.</p>
        </div>

        <div class="help-shell">
          <aside class="help-rail">
            <div class="help-searchwrap">
              <input type="search" id="helpSearch" class="form-control" autocomplete="off"
                     placeholder="Search the handbook…" aria-label="Search the handbook" />
              <button type="button" id="helpSearchClear" class="help-clear" aria-label="Clear search" hidden>&times;</button>
            </div>
            <div id="helpHits" class="help-hits" role="status" aria-live="polite"></div>
            <nav aria-label="Handbook contents"><ol id="helpToc" class="help-toc"></ol></nav>
          </aside>

          <div class="help-body" id="helpBody">
            <div id="helpEmpty" class="help-empty">
              <h3>No matches</h3>
              <p class="text-muted">Nothing in the handbook mentions that. Try a shorter word &mdash;
                <em>weights</em>, <em>session</em>, <em>import</em>.</p>
            </div>
            ${sections.map(s => this.renderHelpSection(s)).join('')}
          </div>
        </div>
      </section>`;
  },

  renderHelpSection(s) {
    const chips = (s.roles || []).map(r =>
      `<span class="help-chip help-chip-${r.kind}">${r.label}</span>`).join('');
    return `
      <section class="help-section" id="help-${s.id}" data-part="${s.part}" data-title="${s.title}">
        <h3 class="help-h2">${s.title}</h3>
        ${chips ? `<div class="help-chips">${chips}</div>` : ''}
        ${s.body}
      </section>`;
  },

  /** Where to click, rendered as a path so it reads as a route rather than prose. */
  helpPath(...steps) {
    return `<p class="help-path">${steps.map(t => `<b>${t}</b>`).join(' <span>&rsaquo;</span> ')}</p>`;
  },

  helpNote(label, html) {
    return `<div class="help-note"><span class="help-note-label">${label}</span>${html}</div>`;
  },

  helpWarn(label, html) {
    return `<div class="help-warn"><span class="help-warn-label">${label}</span>${html}</div>`;
  },

  helpTable(headers, rows) {
    return `
      <div class="help-tablewrap"><table class="help-table">
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>`;
  },

  helpSections() {
    const P = (...s) => this.helpPath(...s);
    const N = (l, h) => this.helpNote(l, h);
    const W = (l, h) => this.helpWarn(l, h);
    const T = (h, r) => this.helpTable(h, r);

    const COACH = { kind: 'coach', label: 'Coach' };
    const ADMIN = { kind: 'admin', label: 'Admin' };
    const ALL   = { kind: 'all', label: 'Everyone' };

    return [
      {
        id: 'first', part: 'Getting started', title: 'First time here', roles: [ALL],
        body: `
          <p>The site has a public side and a coaching side. Anyone can see the roster, the schedule
          and the next fixture without signing in. Everything else &mdash; ratings, practice plans,
          the Competitive Matrix &mdash; needs an account, and an account needs approving.</p>
          <h4>Signing up</h4>
          <ol class="help-steps">
            <li>Click <b>Sign In</b>, then <b>Create an account</b>, using an email you actually read.</li>
            <li>Check your inbox for a <b>6-digit code</b> and type it into the box on screen. The
                code expires after about an hour, so if it has sat overnight, register again for a
                fresh one.</li>
            <li>Wait for a coach or admin to approve you. Until then you can sign in, but you see the public site.</li>
          </ol>
          ${N('If the email does not arrive', `<p>Check your spam folder first &mdash; mail from a
            new domain often lands there until the address is recognised. Marking it
            <em>Not spam</em> helps every player who signs up after you. If it is genuinely not
            there, ask a coach to check whether that address already has an account: registering
            an address twice sends nothing the second time.</p>`)}
          ${N('If you are stuck at pending', `<p>Approval is not automatic and no reminder is sent.
            Message whoever runs the program &mdash; it takes them about four seconds.</p>`)}
          <h4>What each role can do</h4>
          ${T(['Role', 'Can see', 'Can change'], [
            ['<b>Guest</b>', 'Roster, schedule, home page, this handbook', 'Nothing'],
            ['<b>Player</b>', 'The above, plus their team’s pages and the quiz', 'Their quiz answers'],
            ['<b>Coach</b>', 'Everything for teams they are assigned to', 'Roster, schedule, matrix and practice plans for those teams'],
            ['<b>Admin</b>', 'Everything, every team', 'All of the above, plus teams, organizations and coach assignments']
          ])}
          <p>A coach only gets write access to teams they are <em>assigned</em> to. Having the coach
          role is not enough on its own.</p>`
      },
      {
        id: 'switch', part: 'Getting started', title: 'Switching teams', roles: [ALL],
        body: `
          <p>The program can run several squads at once &mdash; a varsity, a JV, and club teams that
          are not part of the school at all. The team picker in the header decides which one you are
          looking at.</p>
          ${P('Header', 'team picker')}
          <p>Nearly everything follows that choice: the roster, the schedule, the Competitive Matrix,
          and the headings on the page. If a page says <em>Varsity</em> and you expected JV, the
          picker is the first thing to check.</p>
          ${N('It remembers, per device', `<p>Your choice is stored on that device only. Sign in on a
            phone and you will pick again &mdash; and it will not disturb what anyone else sees.</p>`)}
          <p>Which teams appear depends on who you are: a coach sees the teams they are assigned to,
          a player sees the team they are on, and a visitor sees the public default.</p>`
      },
      {
        id: 'roster', part: 'Every week', title: 'Roster', roles: [ALL, COACH],
        body: `
          <p>The squad for whichever team is selected. Click any player for their detail card.
          Coaches see technical, tactical, physical and mental ratings; visitors do not.</p>
          ${N('A player has two numbers', `<p>The <b>jersey number</b> is their shirt, and it appears
            on the roster card. The <b>recording number</b> is a short number they write on paper
            sheets, and it appears everywhere results are recorded &mdash; the Matrix, sessions, 1v1s
            and the round robin. They are not the same, and the recording number is the one that
            matters for scoring.</p>`)}
          ${N('First and last name are separate', `<p>Entered as two fields, so the roster can be
            sorted and searched by surname. Imports accept either two columns or one, including
            <code>Herrera, Mateo</code>.</p>`)}
          ${P('Roster', 'Add Player')}
          <p>Search by name first. If the player already exists &mdash; because they are on another
          team in your program &mdash; reuse that record rather than making a second one. One person,
          one record: the jersey number, position and stats are stored per team, so the same player
          can be a #9 for the school and a #4 for a club without the two interfering.</p>
          ${N('One team per organization', `<p>A player can be on one team per organization, and on a
            club team as well. So a Beaumont player cannot be on both Varsity and JV &mdash; but they
            can be on Varsity <em>and</em> a Legends FC team, because those are different
            organizations.</p>`)}`
      },
      {
        id: 'schedule', part: 'Every week', title: 'Schedule &amp; results', roles: [ALL, COACH],
        body: `
          <p>Fixtures for the selected team, in date order, with the next one counting down on the
          home page.</p>
          <h4>Recording a result</h4>
          <ol class="help-steps">
            <li>Open the fixture and set its status to <b>Completed</b>.</li>
            <li>Enter the score.</li>
          </ol>
          <p>Both matter. The record and goals-per-game on the home page are built from completed
          fixtures only, so a played match left as <em>Upcoming</em> counts for nothing.</p>
          ${W('A past match will not stay as &ldquo;next&rdquo;', `<p>The home page picks the next
            fixture by date and ignores anything more than three hours past kickoff. If your last
            match is in the past and no future one is entered, the banner reads
            <b>No upcoming fixtures</b>. That is accurate, not broken &mdash; add the next fixture
            and it returns.</p>`)}
          <h4>Home and away</h4>
          <p>Set the home/away flag <em>and</em> the location to match. They are shown side by side,
          so a fixture marked Home with a location of &ldquo;Away &ndash; Palm Springs&rdquo; reads as
          a contradiction to everyone who looks at it.</p>`
      },
      {
        id: 'directions', part: 'Every week', title: 'Directions to an away game', roles: [ALL],
        body: `
          <p>On an away fixture the <b>&#9992; AWAY</b> badge is a link. Tap it and your phone opens
          turn-by-turn directions from wherever you are standing.</p>
          <p>It only becomes a link when someone has recorded a <b>venue address</b> for that
          fixture. Without one the badge stays plain.</p>
          ${W('Why the app will not guess', `<p>The location on most fixtures is just the
            opponent&rsquo;s name, and a name is not a destination. Sent to a map, &ldquo;Redlands&rdquo;
            lands in the middle of a city of seventy thousand &mdash; and this schedule has both
            <em>Redlands</em> and <em>Redlands East Valley</em> on it. A link to the wrong town is
            worse than no link, so only an address a coach typed earns one.</p>`)}
          <h4>Adding an address</h4>
          ${P('Schedule', 'Edit', 'Venue address')}
          <p>Or add an <b>Address</b> column to the schedule spreadsheet and import it. Clearing the
          box removes the address and the link with it.</p>
          ${N('It is the campus, not the pitch', `<p>Addresses point at a school&rsquo;s main
            entrance. If a fixture is played on a district ground or an overflow field somewhere
            else, edit that one fixture.</p>`)}`
      },
      {
        id: 'lineup', part: 'Match day', title: 'Setting a lineup', roles: [COACH],
        body: `
          <p>A pitch, a formation, and your squad down the side. Drag a player onto a position, or
          tap the player and then tap the position &mdash; the tap route works one-handed, which is
          the one that matters on a touchline.</p>
          ${P('Schedule', 'Lineup')}
          <p>Every fixture can have its own. <b>Default lineup</b>, beside <em>Add New Match</em>,
          sets a shape for the squad that is not tied to any fixture &mdash; it is what a new
          fixture starts from.</p>
          <h4>The rules it enforces</h4>
          <ul>
            <li>A position holds one player and a player holds one position. That is what stops a
              printed card carrying twelve names.</li>
            <li>Changing formation keeps everyone whose position still exists, so trying 4-3-3 and
              going back does not cost you the XI.</li>
            <li>Anyone not in the XI is on the bench unless you mark them <b>Out</b>.</li>
          </ul>
          <p>Print the card and it fits one page, with the XI, the bench and the shape.</p>`
      },
      {
        id: 'plusminus', part: 'Match day', title: 'Tracking plus/minus live', roles: [COACH],
        body: `
          <p>Who is on the pitch when good things happen. One tap per moment, during the game.</p>
          ${P('Schedule', '&plusmn; Plus/Minus')}
          <h4>The gestures</h4>
          ${T(['Do this', 'And it records'], [
            ['Tap a player', 'Plus one'],
            ['Long press, or two fingers', 'Minus one'],
            ['Drag from the bench onto a player', 'A substitution &mdash; off, then on'],
            ['Drag a player around the pitch', 'Moves them, records nothing'],
            ['SHOT / GOAL / ASSIST, then a player', 'That event against them']
          ])}
          <p>The pitch opens with your saved lineup already on it, so nobody is arranging eleven
          players at kickoff. Eleven is the limit; take one off before sending another on.</p>
          ${W('Start the clock first', `<p>Plus and minus are refused while the clock is stopped,
            and the screen says so under the clock button. It is not fussiness: every event is
            stamped with the match clock, and playing time and goal differential are both worked
            out from those stamps. Recorded before kickoff they stamp at 0:00 and every player
            finishes the match credited with no minutes at all &mdash; the counters go up, the sheet
            looks right, and the minutes column is quietly worthless.</p>`)}
          ${N('Nothing is ever deleted', `<p><b>Undo</b> removes the last event. <b>Clear pitch</b>
            takes everyone off. Neither erases what was earned: the log is append-only, so minutes
            simply stop counting. That is also why the numbers survive a flat battery &mdash; reopen
            the match and the clock, the period and every figure come back.</p>`)}`
      },
      {
        id: 'season', part: 'Match day', title: 'Season plus/minus', roles: [COACH],
        body: `
          <p>Every tracked match added up, and a chart per player showing whether they are getting
          better.</p>
          ${P('Schedule', '&#128200; Season +/&minus;')}
          <h4>Reading it</h4>
          <p>Every figure is <b>per full match</b> &mdash; 80 minutes for a high school fixture, and
          whatever your club plays otherwise. Not per 90: that is the professional convention, and
          on an 80-minute game it would inflate every number by an eighth, so a player who was on
          the whole time would show more than they actually did.</p>
          <p>Raw totals mostly measure who got picked. A substitute working their way into the side
          shows a rising total without having played any better, which is the opposite of what you
          are looking for. The rate puts a starter and a substitute on the same footing.</p>
          <h4>The two lines on each chart</h4>
          ${T(['What you see', 'What it means'], [
            ['A dot', 'One match. Sized by how long they were on, and labelled with the minutes'],
            ['The line', 'Their running rate for the season, which steadies as minutes build up'],
            ['A small faint dot', 'A short outing &mdash; a big number off very little time'],
            ['A dash in the table', 'They have not been on the pitch, which is not the same as zero']
          ])}
          ${N('Short outings are shown on purpose', `<p>One plus in five minutes reads as +16, which
            looks absurd because it is. The usual answer is to hide anyone under a minutes
            threshold. That would hide exactly the players you are deciding about &mdash; this
            report exists to tell you who deserves more minutes. So the uncertainty is drawn instead:
            a faint speck is a wild number off almost no time, and the judgement stays yours.</p>`)}
          <p>No trend arrow appears under three appearances. Two numbers are not a trend.</p>`
      },
      {
        id: 'pmimport', part: 'Match day', title: 'Importing plus/minus figures', roles: [COACH, ADMIN],
        body: `
          <p>For loading a season you tracked on paper, or for filling the report with something to
          look at.</p>
          ${P('Admin', 'CSV', '&plusmn; Plus/Minus Match Stats', 'Download Template')}
          <p>One row per player per match. Players are named by their <b>recording number</b>.</p>
          ${T(['Column', 'Notes'], [
            ['Date, Opponent', 'Must match a fixture. Any date the schedule sheet accepts &mdash; 12/8/2026, 8-Dec, DEC 8 2026'],
            ['GoalsFor, GoalsAgainst', 'The match score. Repeat on every row; only the first is read'],
            ['RecordingNumber', 'Which player. A number nobody carries is reported, never guessed'],
            ['Minutes', 'Minutes played in that match'],
            ['Plus, Minus, Shots, Goals, Assists', 'Counts. Blank means none']
          ])}
          <p>Drop the Date column and the opponent is enough, so long as you play them once. Play
          them twice, home and away, and the rows are skipped rather than attached to a guess.</p>
          ${W('A match holds 880 player-minutes and no more', `<p>Eleven on the pitch for eighty
            minutes. Add up the Minutes column for a fixture: over that and the sheet describes a
            match that could not have happened, and opening it in Plus/Minus will show more than
            eleven players standing on the pitch. The import says so, and the totals still load.</p>`)}
          ${N('There is no goal-differential column', `<p>It is not a figure a player has &mdash; it
            is a consequence of who was on the pitch when a goal went in. Give the score once and
            each player&rsquo;s differential falls out of it.</p>`)}
          <p>Re-importing a corrected sheet replaces that fixture rather than adding to it, so the
          figures never double.</p>`
      },
      {
        id: 'matrix', part: 'The Competitive Matrix', title: 'How the Matrix scores', roles: [ALL, COACH],
        body: `
          <p>The Competitive Matrix ranks players on how they compete in training. Two ideas drive
          it, and everything else follows from them.</p>
          <h4>1. Exercises are not equal</h4>
          <p>Every exercise carries a <b>weight</b> that you set. A 1v1 might be worth 3.0 and a
          fitness test 1.5, because you have decided a 1v1 tells you more about a player. The weight
          is how much that exercise moves someone&rsquo;s score.</p>
          <h4>2. Everyone is scored on their share</h4>
          <p>Each exercise gives a player two numbers: what they <b>earned</b>, and what was
          <b>available</b>. Available is always the exercise&rsquo;s full weight. The best result
          earns all of it; the rest scale down by where they finished. Your rank is
          <em>earned &divide; available</em> &mdash; a percentage, not a running total.</p>
          <p>That is deliberate. Missing a session with good reason should not cost you the season,
          and a player who trains twice as often should not out-rank a better player on volume.</p>
          <pre class="help-calc">COOPER'S (1.5)           1v1 LADDER (3.0)         SMALL-SIDED (2.5)
Cesar 2800  1st &rarr; 1.500   beat Caleb    &rarr; 3.000    won  &rarr; 2.500
Caleb 2650  2nd &rarr; 0.750   lost to Cesar &rarr; 0.000    won  &rarr; 2.500
Dylan 2500  3rd &rarr; 0.375   drew Marco    &rarr; 1.500    lost &rarr; 0.000

<span class="help-calc-hl">Cesar   7.000 of 7.000 = 100.0%   1st</span>
Caleb   3.250 of 7.000 =  46.4%   2nd
Dylan   1.875 of 7.000 =  26.8%   3rd</pre>
          <p>Dylan came last in the Cooper&rsquo;s and still earned 0.375 &mdash; a quarter of that
          exercise&rsquo;s weight. Turning up and finishing last always beats not turning up.</p>
          <h4>The four ways to measure</h4>
          ${T(['Type', 'Use it for', 'Best result'], [
            ['<b>1v1</b>', 'A 1v1 ladder', 'Recorded pair by pair'],
            ['<b>Small-sided</b>', 'Scrimmages, small-sided games', 'Won'],
            ['<b>Counted, high wins</b>', 'Cooper&rsquo;s distance, beep level, shots made of ten', 'Highest number'],
            ['<b>Timed, low wins</b>', 'A sprint or a timed circuit', 'Lowest number']
          ])}
          <h4>Absence</h4>
          ${T(['Marked', 'Effect on their score'], [
            ['<b>Here</b>', 'Scored on their result'],
            ['<b>Excused</b>', 'Nothing at all &mdash; as if the session never happened for them'],
            ['<b>No-show</b>', 'Zero earned against the full weight &mdash; it pulls the share down']
          ])}`
      },
      {
        id: 'weights', part: 'The Competitive Matrix', title: 'Setting exercise weights', roles: [COACH],
        body: `
          ${P('Player Ratings', '⚖️ Exercise weights')}
          <p>Every drill in your library is listed with a weight and a measurement type. Set them
          together &mdash; you are deciding the balance of your whole program, not editing one drill.</p>
          ${W('Do this first', `<p>Every drill starts as <b>1v1</b> at weight <b>3.0</b>. Until you
            change some, the session recorder has nothing to offer and its picker stays empty. That
            is the most common &ldquo;it is broken&rdquo; moment &mdash; it is not; nothing has been
            set up yet.</p>`)}
          <h4>A reasonable starting point</h4>
          ${T(['Exercise', 'Weight', 'Measure'], [
            ['1v1 gauntlet', '3.0', '1v1'],
            ['Small-sided game', '2.5', 'Small-sided'],
            ['Finishing under pressure', '2.0', 'Counted, high wins'],
            ['12-minute Cooper test', '1.5', 'Counted, high wins'],
            ['Three laps', '1.5', 'Timed against a standard'],
            ['Beep test', '1.0', 'Counted, high wins']
          ])}
          <h4>Ranked against the squad, or against a standard?</h4>
          <p>Two of these measure a time, and they answer different questions.
          <b>Timed, fastest wins</b> ranks the squad against each other that session, so somebody is
          always top and somebody always last. <b>Timed against a standard</b> pays out on absolute
          times &mdash; hit 4:30 and you earn it whether six team-mates beat you or nobody did.</p>
          ${N('Standards are per squad', `<p>Choose <b>Timed against a standard</b> and rows appear
            beneath the drill for the team currently selected. A 4:30 that stretches a varsity side
            is out of reach for an under-14, so each squad carries its own times. Set none and that
            exercise is simply not counted for them.</p>`)}
          ${N('Changing a weight re-scores history', `<p>Raise the Cooper&rsquo;s from 1.0 to 1.5 and
            every Cooper&rsquo;s you have ever recorded is re-scored immediately, and the table
            re-ranks. Set it back and it reverts. Nothing is frozen &mdash; which is the point, but it
            does mean a table you showed the squad on Monday can look different on Tuesday if you
            retune.</p>`)}`
      },
      {
        id: 'oneveone', part: 'The Competitive Matrix', title: 'Recording a 1v1', roles: [COACH],
        body: `
          ${P('Player Ratings', 'Record Practice Drill Scores')}
          <p>1v1s are recorded one pair at a time, because a ladder genuinely produces
          &ldquo;who beat whom&rdquo; and that record is worth keeping. Pick both players, the
          outcome, and the drill, then save.</p>
          <p>The form <b>stays open</b> after each save and clears the two players while keeping the
          drill and the date &mdash; so a session&rsquo;s results go in one after another. It confirms
          each one and counts them as you go. Close it when you are done.</p>
          ${W('Always attach the drill', `<p>The drill is where the weight comes from. A result
            recorded with the drill left blank scores at <b>1.0</b> no matter how important that
            exercise actually is &mdash; and nothing warns you.</p>`)}`
      },
      {
        id: 'session', part: 'The Competitive Matrix', title: 'Recording a session', roles: [COACH],
        body: `
          ${P('Player Ratings', '📋 Record a session')}
          <p>For anything that is not a 1v1 &mdash; a Cooper&rsquo;s test, a beep test, a shooting
          drill, a small-sided game &mdash; the whole squad goes in on one screen and saves in one go.</p>
          <ol class="help-steps">
            <li>Pick the exercise. Only drills with a non-1v1 measurement type appear here.</li>
            <li>Check the date.</li>
            <li>Type each player&rsquo;s number down the column &mdash; metres, level or shots
                made. For a small-sided game, pick won, drew or lost instead. For a
                <b>timed</b> exercise type <code>mm:ss</code>, so <code>4:28</code> rather than
                268.</li>
            <li>Mark anyone absent as <b>Excused</b> or <b>No-show</b>. Their number box is ignored either way.</li>
            <li>Save. The placings and the points are worked out for you.</li>
          </ol>
          ${N('A player marked &ldquo;Here&rdquo; must have a result', `<p>Leave someone&rsquo;s box
            blank and the save is refused, naming them. Silently skipping them would quietly treat a
            player who was present as though they had been excused.</p>`)}
          <h4>Fixing a mistake</h4>
          ${P('Player Ratings', 'Recorded sessions', 'Delete')}
          <p>Sessions cannot be edited &mdash; delete the session and enter it again. Deleting removes
          every result in it and re-ranks the table, so it asks first and names the exercise and date.</p>
          <h4>Built for reading off a paper sheet</h4>
          <p>Players are listed by <b>recording number</b> and ordered by it, matching the order the
          sheet is written in. The <b>Order by</b> chips switch to name, and re-sorting keeps
          whatever you have already typed. The <b>Wide</b> button widens the window and remembers
          the choice for next time.</p>
          ${N('A timed standard shows what it earned', `<p>Type a time and the figure it earns
            appears beside the box, so you can see the band land before saving. If the squad has no
            standards set for that exercise, the screen says so in red rather than saving something
            that will not be scored.</p>`)}`
      },
      {
        id: 'reading', part: 'The Competitive Matrix', title: 'Reading the table', roles: [ALL],
        body: `
          <h4>One exercise at a time</h4>
          <p>The <b>Exercise</b> picker above the table switches between the overall board and a
          single exercise &mdash; who has the most small-sided wins, who is best at the Cooper's.
          For a 1v1 or small-sided drill the column is wins-draws-losses; for a counted or timed one
          it is each player's best figure. Any column heading re-sorts.</p>
          ${N('Best means their peak', `<p>The highest count for a counted exercise, and the FASTEST
            time for a timed one. Points are still totalled across every attempt, so that column
            agrees with the overall board.</p>`)}
          ${T(['Column', 'Means'], [
            ['<b>EX</b>', 'Exercises they have been scored on. Excused sessions are not counted.'],
            ['<b>W-D-L</b>', 'Wins, draws and losses from 1v1s and small-sided games. Measured tests have no W/L.'],
            ['<b>PTS</b>', 'Points earned.'],
            ['<b>AVAIL</b>', 'Points that were on offer.'],
            ['<b>SHARE</b>', 'PTS &divide; AVAIL. This is what the ranking uses.']
          ])}
          <p>A dash in SHARE means nothing has been scored for that player yet &mdash; not zero
          percent. Two players on the same share are separated by who has competed more.</p>`
      },
      {
        id: 'roundrobin', part: 'Practice', title: '1v1 round robin', roles: [COACH],
        body: `
          ${P('Practice planner', '1v1 Round Robin')}
          <p>Builds a schedule where every player meets every other exactly once, labelled the way
          the paper sheets read &mdash; <code>(1) Cesar A. vs (4) Tom B.</code> A squad of 24 is 23
          rounds of 12 matches.</p>
          <p>Two outputs: <b>Print / Save as PDF</b> gives a sheet laid out round by round with a
          blank column to write results into, and <b>Download CSV</b> gives the same schedule as a
          file.</p>
          ${N('It marks itself off', `<p>Nothing is stored. The schedule is built from the roster
            each time you open it, and pairings already recorded in the Matrix are ticked with their
            result &mdash; so a sheet reprinted mid-tournament shows what is left. Add a player and
            re-open to get a new schedule.</p>`)}
          ${N('An odd squad gets a bye', `<p>One player sits out each round, and the bye rotates so
            nobody sits out twice.</p>`)}`
      },
      {
        id: 'planner', part: 'Practice', title: 'Practice planner', roles: [COACH],
        body: `
          <p>Build a session from your drill library, reorder it, and print or save it as a PDF to
          take to the field. The total running time adds up as you go.</p>
          ${P('Coach Planner', 'Add New Drill')}
          <p>Set one plan as active and it becomes the session the planner opens on.</p>`
      },
      {
        id: 'drills', part: 'Practice', title: 'The drill library', roles: [COACH],
        body: `
          ${P('Coach Planner', '➕ Add New Drill')}
          <p>This is where drills are created, edited and deleted. The Exercise weights screen only
          sets what they are <em>worth</em> &mdash; it cannot add or remove them, because both screens
          read the same library.</p>
          <p>Each drill holds a name, category, coach&rsquo;s notes, a diagram, its matrix weight and
          its measurement type. Anything you add here appears in Exercise weights straight away.</p>`
      },
      {
        id: 'diagram', part: 'Practice', title: 'The diagrammer', roles: [COACH],
        body: `
          <p>A drawing board for tactics: players, cones, balls, arrows and freehand lines on a choice
          of pitch types, with undo and redo.</p>
          <p>Diagrams attach to a drill or to a plan item. <b>Keyframes</b> let you build a sequence
          &mdash; set the starting shape, add a keyframe, move the pieces &mdash; and each step prints
          as its own picture in the PDF, so movement reads on paper.</p>`
      },
      {
        id: 'thoughts', part: 'Practice', title: 'Daily thoughts &amp; the quiz', roles: [COACH, ALL],
        body: `
          <p>A short coaching message on the home page &mdash; one is active at a time, and each
          squad has its own. Write one from
          <span class="help-path">Home &rsaquo; Coach's Daily Thoughts &rsaquo; Manage</span>.</p>
          <p>Give it a short <b>title</b> and a quiz question can name it, in which case that
          question is asked only while that message is the active one. Questions naming no message
          &mdash; the formation, the participation rule &mdash; are always asked.</p>
          <h4>The quiz</h4>
          ${P('Admin panel', 'Quiz Questions')}
          <p>Questions are shared across the organization, and each squad is asked the ones ticked
          against it. Each carries its options, which is correct, and an explanation shown to a
          player who gets it wrong.</p>
          ${W('A question no team has ticked is asked by nobody', `<p>It sits in the bank, invisible
            in every quiz. The list says <em>no team asks this</em> against those rows, which is the
            only place they can be found.</p>`)}
          ${N('A question can have three options, or six', `<p>Four is not required. The editor shows
            a spare box below the ones in use; fill it for another option, blank one to remove
            it.</p>`)}`
      },
      {
        id: 'admin', part: 'Running the program', title: 'The admin panel', roles: [ADMIN, COACH],
        body: `
          ${P('Header', '⚙️ Admin &amp; Role Control Center')}
          <p>Several collapsible sections. They start closed &mdash; click a heading to open it.
          Which you see depends on your role: team and organization management is admin-only, while
          categories, quiz questions and the unassigned-players list are open to coaches.</p>
          ${T(['Section', 'For'], [
            ['Pending user approval queue', 'Approving or rejecting new signups'],
            ['Teams &amp; coach assignments', 'Creating organizations and teams, assigning coaches'],
            ['School &amp; club profile settings', 'Name, mascot, colours and record of the current organization'],
            ['Import &amp; export data', 'Spreadsheet in and out']
          ])}`
      },
      {
        id: 'orgs', part: 'Running the program', title: 'Organizations &amp; teams', roles: [ADMIN],
        body: `
          <p>An <b>organization</b> is a school or a club. <b>Teams</b> belong to one. That
          distinction is what lets a player be on a school team and a club team at the same time.</p>
          <h4>Creating an organization</h4>
          ${P('Admin', 'Teams &amp; coach assignments', 'Create an organization')}
          <p>Name, mascot, a short code, and whether it is a school or a club. The mascot is used in
          page headings, so it is not optional.</p>
          <h4>Creating a team</h4>
          ${W('Check the organization dropdown', `<p>It defaults to the first organization in the
            list. Creating &ldquo;U16 Boys&rdquo; without changing it files a club team inside the
            school &mdash; which then blocks a school player from joining it, because that is one team
            per organization. The confirmation names the organization back to you; read it.</p>`)}`
      },
      {
        id: 'assign', part: 'Running the program', title: 'Assigning coaches', roles: [ADMIN],
        body: `
          ${P('Admin', 'Teams &amp; coach assignments')}
          <p>Every team lists its coaches with a dropdown to add another. A team showing
          <b>No coaches assigned</b> is one nobody can edit.</p>
          ${N('Being a coach is not enough', `<p>Having the coach role lets someone in. Being assigned
            to a team is what lets them change it. An unassigned coach can sign in, see the team, and
            find every save refused &mdash; which looks like a broken app rather than a missing
            assignment.</p>`)}
          ${W('Deleting an account removes their assignments', `<p>Delete a coach&rsquo;s login and
            their team assignments go with it. When they sign up again they arrive as a new person:
            approve them, then re-assign them to their teams.</p>`)}`
      },
      {
        id: 'import', part: 'Running the program', title: 'Importing &amp; exporting', roles: [COACH, ADMIN],
        body: `
          ${P('Admin', 'Import &amp; export data')}
          <p>Eleven tables move in and out as Excel or CSV &mdash; one workbook, one file per table,
          or a zip of the lot. Download a template first; it has the right column names.</p>
          <h4>Importing to several teams at once</h4>
          <p>Add a <b>Team</b> column and each row goes to the team it names. Leave it blank and rows
          join whichever team is currently selected. A team name that does not exist yet is created
          &mdash; so a typo makes a squad, and &ldquo;Varisty&rdquo; becomes a fourth team.</p>
          ${N('Import builds rosters, not logins', `<p>Importing players creates roster entries. It
            cannot create accounts people sign in with &mdash; that is a separate job, run from a
            computer by whoever administers the site.</p>`)}`
      },
      {
        id: 'ex-team', part: 'Worked examples', title: 'Add an organization and a team', roles: [ADMIN],
        body: `
          <p>Everything else hangs off a team, so this is the first thing to do in a new program.
          An <b>organization</b> is a school or a club; <b>teams</b> belong to one. A player can be
          on one team per organization, which is what lets somebody play for their school and a club
          at the same time.</p>
          ${P('Admin panel', 'Teams & Coach Assignments')}
          <h4>Worked example &mdash; a club with two age groups</h4>
          <ol class="help-steps">
            <li>Under <b>Create an organization</b>, enter the name (<code>Riverside Surf SC</code>),
                a mascot (<code>Surf</code>), a short code (<code>rvsc</code>) and type <b>Club</b>.
                Click <b>+ Create</b>.</li>
            <li>Under <b>Create a team</b>, pick that organization, name the team
                <code>U16 Boys</code>, set the season, and create it. Repeat for <code>U14 Boys</code>.</li>
            <li>Mark one team <b>public default</b> if visitors should see it when they arrive with
                no team chosen.</li>
          </ol>
          ${N('Mascot is required', `<p>It is not decoration &mdash; the mascot appears in page
            headings and on the home page, so the form will not save without one.</p>`)}
          ${W('Only an admin can do this', `<p>Creating teams and organizations is admin-only in the
            database itself, not just in the interface. A coach clicking these controls would be
            refused by the database, so they are not shown to them at all.</p>`)}`
      },
      {
        id: 'ex-coach', part: 'Worked examples', title: 'Add a coach and give them a team', roles: [ADMIN],
        body: `
          <p>Two separate things: the person needs an <b>account</b>, and that account needs
          <b>assigning</b> to each team they coach. Having the coach role on its own grants nothing.</p>
          <h4>Worked example &mdash; a new assistant for JV</h4>
          <ol class="help-steps">
            <li>Ask them to sign up themselves at <b>Sign In &rarr; Create an account</b>, choosing
                <b>Coach</b> as the role they are asking for.</li>
            <li>Open <span class="help-path">Admin panel</span> and find them under
                <b>pending approvals</b>. Approve them &mdash; they are now a coach with no teams.</li>
            <li>Under <b>Teams &amp; Coach Assignments</b>, find <b>JV</b>, pick their name from the
                <em>assign a coach</em> list, and click <b>Assign</b>.</li>
          </ol>
          ${W('Approving is not assigning', `<p>This is the single most common confusion. An approved
            coach with no team assignment can sign in and see the public site and nothing else. If a
            new coach says the app looks empty, check their assignments first.</p>`)}
          ${N('Removing access', `<p>The &times; beside their name on a team removes that
            assignment immediately. Their account stays; only that team's write access goes.</p>`)}`
      },
      {
        id: 'ex-players', part: 'Worked examples', title: 'Add players, and give them recording numbers', roles: [COACH, ADMIN],
        body: `
          <p>A player has two different numbers, and mixing them up causes most of the confusion
          here.</p>
          ${T(['Number', 'What it is', 'Where it shows'], [
            ['<b>Jersey #</b>', 'Their shirt number', 'The roster card only'],
            ['<b>Recording #</b>', 'A short number, usually 1..N, that they write on paper sheets',
             'Everywhere results are recorded: the Matrix, sessions, 1v1s, the round robin']
          ])}
          <p>The recording number exists because handwriting on a paper sheet is not always
          readable. A player writes <code>7</code> rather than their name, and the sheet stays
          legible.</p>
          <h4>Worked example &mdash; one player by hand</h4>
          ${P('Roster', '+ Add New Player')}
          <ol class="help-steps">
            <li>Enter <b>First Name</b> and <b>Last Name</b> separately &mdash; not one full name.</li>
            <li>Set the <b>Recording #</b>. Most programs number the squad 1..N alphabetically at the
                start of the season and leave it alone.</li>
            <li>Jersey # can be left blank until shirts are handed out.</li>
          </ol>
          <h4>Worked example &mdash; a whole squad from a spreadsheet</h4>
          ${P('Admin panel', 'Import & Export', 'Players')}
          <p>Download the template first, so the headings are right. The columns that matter:</p>
          ${T(['Column', 'Example', 'Notes'], [
            ['<code>FirstName</code>', 'Mateo', 'Or use a single <code>Name</code> column &mdash; see below'],
            ['<code>LastName</code>', 'Herrera', ''],
            ['<code>RecordingNumber</code>', '12', 'The paper-sheet number'],
            ['<code>Number</code>', '9', 'Jersey number, optional'],
            ['<code>Position</code>', 'MF', 'Free text; be consistent'],
            ['<code>Team</code>', 'JV', 'Blank means the team selected in the header']
          ])}
          ${N('A single Name column still works', `<p>Both <code>Mateo Herrera</code> and
            <code>Herrera, Mateo</code> are read correctly &mdash; a comma means the surname comes
            first. A two-word surname survives the comma form (<code>Bustillos Correa, Luis</code>)
            where it cannot be guessed from spaces alone.</p>`)}
          ${W('Re-importing updates, it does not duplicate', `<p>Players are matched by full name, so
            importing a corrected sheet updates the people already there. But a blank cell CLEARS the
            stored value &mdash; export the roster first and edit that file, rather than starting a
            fresh sheet with only the columns you care about.</p>`)}`
      },
      {
        id: 'ex-drills', part: 'Worked examples', title: 'Add a drill and decide how it scores', roles: [COACH],
        body: `
          <p>A drill in the library can be used in a practice plan, scored in the Matrix, or both.
          What decides how it scores is its <b>measure</b>.</p>
          ${P('Practice planner', 'Add New Drill')}
          ${T(['Measure', 'Use it for', 'How points are earned'], [
            ['<b>1v1 (pairings)</b>', 'Head-to-head duels', 'Win 1.0, draw 0.5, loss 0'],
            ['<b>Small-sided (W/D/L)</b>', 'Team games in a session', 'Win 1.0, draw 0.5, loss 0'],
            ['<b>Counted, higher wins</b>', 'Coopers, beep test, shots made', 'Ranked against the squad that session'],
            ['<b>Timed, fastest wins</b>', 'A sprint where placing matters', 'Ranked against the squad that session'],
            ['<b>Timed against a standard</b>', 'Three laps under 4:30', 'Absolute: hit the time, earn the band']
          ])}
          <h4>Worked example &mdash; a timed standard</h4>
          <ol class="help-steps">
            <li>Create the drill <code>3 Laps</code> with measure <b>Timed against a standard</b>.</li>
            <li>Go to <span class="help-path">Matrix &rsaquo; Exercise Weights</span> and set its
                weight &mdash; how much this exercise is worth next to the others.</li>
            <li>Standards rows appear beneath it for the team currently selected. Enter
                <code>4:30 &rarr; 1</code>, click <b>+ Add a standard</b>, then
                <code>4:40 &rarr; 0.5</code>, and again for <code>4:50 &rarr; 0.25</code>. Save.</li>
            <li><b>Switch to your other squad and set their standards too.</b> They start empty.</li>
          </ol>
          ${N('The number earned multiplies the weight', `<p>On a drill weighted 1.5, hitting 4:30
            earns the full 1.5 and 4:50 earns 0.375. The weight says how much the exercise matters;
            the band says how much of it was earned.</p>`)}
          ${W('A squad with no standards is not scored', `<p>Deliberately, rather than scored zero
            &mdash; a zero would quietly drag their percentage down because nobody had set their
            times yet. The session screen warns you before you save.</p>`)}`
      },
      {
        id: 'ex-session', part: 'Worked examples', title: 'Run a practice and record the results', roles: [COACH],
        body: `
          <h4>Worked example &mdash; a Tuesday session</h4>
          <ol class="help-steps">
            <li><b>Before</b>: build the plan in <span class="help-path">Practice planner</span>,
                adding drills and times, then <b>Save Practice Plan</b> under a name you will
                recognise. <b>Print Practice Plan</b> gives you the sheet to take out.</li>
            <li>For 1v1s, <span class="help-path">Practice planner &rsaquo; 1v1 Round Robin</span>
                prints a sheet of every pairing &mdash; <code>(1) Cesar A. vs (4) Tom B.</code> &mdash;
                with a blank column to write results into.</li>
            <li><b>On the pitch</b>: write results on paper, using recording numbers rather than
                names.</li>
            <li><b>After</b>: for a whole-squad exercise use
                <span class="help-path">Matrix &rsaquo; Record a session</span>; for individual duels
                use <b>Record Practice Drill Scores</b>.</li>
          </ol>
          <h4>Entering from the paper sheet</h4>
          <p>Both screens are built for reading down a sheet. The player lists lead with the
          recording number and are ordered by it, and the 1v1 screen has a box beside each player
          where you can type <code>6</code> or a surname instead of scrolling.</p>
          ${N('A time is typed as mm:ss', `<p><code>4:28</code>, not 268. The screen shows what the
            time earns as you type it, so you can see the band land before saving.</p>`)}
          ${W('An unknown number is refused, not guessed', `<p>Type a recording number nobody has and
            the screen says so and clears the selection. That is deliberate: a misread digit
            attributed to the wrong player would move the standings with nothing to show for
            it.</p>`)}`
      },
      {
        id: 'ex-ratings', part: 'Worked examples', title: 'Set player ratings', roles: [COACH],
        body: `
          <p>Ratings are a coach's own judgement &mdash; technical, tactical, physical and mental,
          each out of 100. They are separate from the Competitive Matrix, which is earned from
          recorded results rather than assigned.</p>
          ${P('Roster', 'a player', 'Edit')}
          <ol class="help-steps">
            <li>Open the player and click <b>Edit</b>.</li>
            <li>Set the four ratings. They default to 80, so a squad left untouched all looks
                identical.</li>
            <li>Save. Visitors never see these; only coaches and admins do.</li>
          </ol>
          ${N('Ratings and the Matrix are different things', `<p>A rating is what you think of a
            player. A Matrix score is what they earned in recorded exercises. A player can be highly
            rated and low on the Matrix if they have not been turning up &mdash; which is exactly the
            comparison worth looking at.</p>`)}
          <p>Ratings can also be set in bulk through the players import, using the
          <code>Tech</code>, <code>Tactical</code>, <code>Physical</code> and <code>Mental</code>
          columns.</p>`
      },
      {
        id: 'ex-plans', part: 'Worked examples', title: 'Reuse a plan across squads', roles: [COACH],
        body: `
          <p>Practice plans belong to one team. The drill library is shared across the whole
          organization, so the drills themselves do not need duplicating &mdash; only the plan.</p>
          <h4>Worked example &mdash; the same session for Varsity and JV</h4>
          <ol class="help-steps">
            <li>Build and save the plan with <b>Varsity</b> selected.</li>
            <li>With that plan loaded, click <b>Copy to team&hellip;</b> beside its name and choose
                <b>JV</b>.</li>
            <li>Switch to JV and open it. Edit it freely &mdash; the copy is independent, so changing
                JV's version leaves Varsity's alone.</li>
          </ol>
          ${N('Renaming a plan', `<p><span class="help-path">Select Practice Plan &rsaquo;
            Rename</span> renames every drill slot in it at once. A name another plan on that team
            already uses is refused, because two plans sharing a name become one session.</p>`)}
          ${W('Copying across organizations is refused', `<p>The drill library belongs to one
            organization, so a plan copied to a club team would point at drills that team cannot
            see. The copy is blocked and names the drills that are missing, rather than half-copying
            and leaving broken slots.</p>`)}`
      },
      {
        id: 'ex-quiz', part: 'Worked examples', title: 'Write a daily message and its quiz', roles: [COACH],
        body: `
          <p>The daily message is what players see on the home page. Quiz questions can be tied to
          it, so a question is only asked while that message is the current one.</p>
          <h4>Worked example</h4>
          <ol class="help-steps">
            <li><span class="help-path">Home &rsaquo; Coach's Daily Thoughts &rsaquo; Manage &rsaquo;
                Add New Thought</span>. Write the message, give it a short <b>title</b> such as
                <code>Week 3 &ndash; High Press</code>, and set it active.</li>
            <li><span class="help-path">Admin panel &rsaquo; Quiz Questions &rsaquo; Add a
                question</span>. Write the question and its options, mark the correct one, and add an
                explanation &mdash; players see it when they get the question wrong.</li>
            <li>Set <b>Tests which message?</b> to that title. Leave it on <em>always asked</em> for
                evergreen questions like the formation or the participation rule.</li>
            <li>Tick which squads are asked it. A question no team has ticked is asked by
                nobody.</li>
          </ol>
          ${N('Questions can be imported too', `<p>A two-sheet workbook: a Thoughts sheet with
            <code>id</code>, <code>Title</code>, <code>ThoughtsText</code>, and a Quiz sheet whose
            <code>id</code> column repeats the number of the message each question belongs to.
            Import the thoughts first, so the numbers exist for the questions to point at.</p>`)}
          ${W('The message is per squad', `<p>Varsity's message and JV's are separate. Write one with
            the wrong team selected and the wrong squad reads it.</p>`)}`
      },
      {
        id: 'fix', part: 'When something looks wrong', title: 'Common confusions', roles: [ALL],
        body: `
          <h4>The session picker is empty</h4>
          <p>No drill has a measurement type other than 1v1 yet. Open <b>Exercise weights</b> and set some.</p>
          <h4>I saved something and nothing changed</h4>
          <p>Hard-reload the page &mdash; Ctrl+Shift+R. Browsers hold on to the old files longer than you expect.</p>
          <h4>I am a coach but everything I save is refused</h4>
          <p>You are not assigned to that team. See <b>Assigning coaches</b>.</p>
          <h4>I signed in and I am still seeing the wrong team</h4>
          <p>Check the team picker in the header. If the team you want is not listed, you are not assigned to it.</p>
          <h4>The leaderboard says everyone has 0</h4>
          <p>Either no results have been recorded for that team, or every drill is still at its default weight.</p>
          <h4>A player is missing from the session grid</h4>
          <p>The grid lists the selected team&rsquo;s roster. If they are not on it, add them on the Roster first.</p>
          <h4>The home page says &ldquo;No upcoming fixtures&rdquo;</h4>
          <p>Every fixture on record is in the past. Add the next one, and record the result of the last.</p>`
      }
    ];
  },

  /**
   * Wire the index, search and scrollspy once the HTML is in the DOM.
   *
   * Called from renderCurrentView on a setTimeout, because the elements below
   * do not exist until innerHTML has landed. Safe to call when the help view
   * is not showing: every lookup returns null and it exits.
   */
  initHelpView() {
    const search = document.getElementById('helpSearch');
    const toc = document.getElementById('helpToc');
    const body = document.getElementById('helpBody');
    if (!search || !toc || !body) return;

    const sections = Array.prototype.slice.call(body.querySelectorAll('.help-section'));
    const clear = document.getElementById('helpSearchClear');
    const hits = document.getElementById('helpHits');
    const empty = document.getElementById('helpEmpty');

    // Build the contents from the rendered sections, so a section added to
    // helpSections() cannot be missing from the index.
    toc.innerHTML = '';
    let lastPart = null;
    const links = sections.map(sec => {
      const part = sec.getAttribute('data-part');
      if (part !== lastPart) {
        const h = document.createElement('li');
        h.className = 'help-toc-part';
        h.textContent = part;
        toc.appendChild(h);
        lastPart = part;
      }
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#help-' + sec.id.replace(/^help-/, '');
      a.innerHTML = sec.getAttribute('data-title');
      a.addEventListener('click', (e) => {
        e.preventDefault();
        sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      li.appendChild(a);
      toc.appendChild(li);
      return a;
    });

    const index = sections.map((sec, i) => ({
      sec, link: links[i], text: sec.textContent.toLowerCase()
    }));

    const unmark = (sec) => {
      const marks = sec.querySelectorAll('mark');
      for (let i = 0; i < marks.length; i++) {
        const m = marks[i];
        m.replaceWith(document.createTextNode(m.textContent));
      }
      sec.normalize();
    };

    const mark = (sec, term) => {
      const walker = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
          if (!n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          const p = n.parentNode.nodeName;
          if (p === 'SCRIPT' || p === 'STYLE' || p === 'MARK') return NodeFilter.FILTER_REJECT;
          return n.nodeValue.toLowerCase().indexOf(term) > -1
            ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });
      const found = [];
      let n;
      while ((n = walker.nextNode())) found.push(n);

      found.forEach(node => {
        const frag = document.createDocumentFragment();
        const txt = node.nodeValue, low = txt.toLowerCase();
        let at = 0, hit;
        while ((hit = low.indexOf(term, at)) > -1) {
          if (hit > at) frag.appendChild(document.createTextNode(txt.slice(at, hit)));
          const m = document.createElement('mark');
          m.textContent = txt.slice(hit, hit + term.length);
          frag.appendChild(m);
          at = hit + term.length;
        }
        if (at < txt.length) frag.appendChild(document.createTextNode(txt.slice(at)));
        node.parentNode.replaceChild(frag, node);
      });
    };

    const run = () => {
      const term = (search.value || '').trim().toLowerCase();
      if (clear) clear.hidden = !term;
      index.forEach(e => unmark(e.sec));

      if (!term) {
        index.forEach(e => {
          e.sec.classList.remove('help-hidden');
          e.link.classList.remove('help-hidden');
        });
        if (hits) hits.textContent = '';
        if (empty) empty.classList.remove('help-empty-show');
        return;
      }

      let n = 0;
      index.forEach(e => {
        const match = e.text.indexOf(term) > -1;
        e.sec.classList.toggle('help-hidden', !match);
        e.link.classList.toggle('help-hidden', !match);
        if (match) { n++; mark(e.sec, term); }
      });

      if (hits) hits.textContent = n === 0 ? 'no matches' : n + (n === 1 ? ' section' : ' sections');
      if (empty) empty.classList.toggle('help-empty-show', n === 0);
    };

    let timer = null;
    search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 110); });
    search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { search.value = ''; run(); } });
    if (clear) clear.addEventListener('click', () => { search.value = ''; run(); search.focus(); });
  }

});
