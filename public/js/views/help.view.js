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
            <li>Confirm the email. The link expires, so if it sits overnight you will need a fresh one.</li>
            <li>Wait for a coach or admin to approve you. Until then you can sign in, but you see the public site.</li>
          </ol>
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
            ['Beep test', '1.0', 'Counted, high wins']
          ])}
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
            <li>Type each player&rsquo;s number down the column &mdash; metres, level, seconds or
                shots made. For a small-sided game, pick won, drew or lost instead.</li>
            <li>Mark anyone absent as <b>Excused</b> or <b>No-show</b>. Their number box is ignored either way.</li>
            <li>Save. The placings and the points are worked out for you.</li>
          </ol>
          ${N('A player marked &ldquo;Here&rdquo; must have a result', `<p>Leave someone&rsquo;s box
            blank and the save is refused, naming them. Silently skipping them would quietly treat a
            player who was present as though they had been excused.</p>`)}
          <h4>Fixing a mistake</h4>
          ${P('Player Ratings', 'Recorded sessions', 'Delete')}
          <p>Sessions cannot be edited &mdash; delete the session and enter it again. Deleting removes
          every result in it and re-ranks the table, so it asks first and names the exercise and date.</p>`
      },
      {
        id: 'reading', part: 'The Competitive Matrix', title: 'Reading the table', roles: [ALL],
        body: `
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
          <p>A short coaching message on the home page &mdash; one is active at a time. Quiz questions
          can be attached so players have to show they read it, and the leaderboard shows who
          answered what.</p>`
      },
      {
        id: 'admin', part: 'Running the program', title: 'The admin panel', roles: [ADMIN, COACH],
        body: `
          ${P('Header', '⚙️ Admin &amp; Role Control Center')}
          <p>Four collapsible sections. They start closed &mdash; click a heading to open it.</p>
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
