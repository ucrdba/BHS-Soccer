/**
 * The eleven tables of the XLSX round trip, defined once.
 *
 * `exportXLSX` in the legacy admin panel writes these definitions out three
 * times — once for the zip, once for the single workbook, once per table —
 * and they have already drifted. Everything here is declared in one place and
 * used by all three modes.
 *
 * **An export invents nothing.** The legacy export exports a hardcoded sample
 * quiz question rather than the real bank, substitutes a fabricated match
 * result when a team has no logs, falls back to two made-up user profiles,
 * and hardcodes Beaumont's name, code, mascot and city as defaults.
 *
 * An export is a backup. A coach who exports, sees a plausible workbook and
 * re-imports it later would inject a fabricated question, two fake profiles
 * and a match that never happened into their own database — and every club
 * would get Beaumont's name on its config sheet.
 *
 * So an empty table exports an **empty sheet with its headers**, which is
 * what tells a coach the table is empty. The headers are also the template,
 * which is what makes a template and an export interchangeable.
 *
 * Extracted from public/js/admin.js during Phase 6.
 */

export interface TableDef {
  key: string;
  fileName: string;
  sheetName: string;
  /** The column order. Also the template, and what an export's keys must match. */
  headers: string[];
  toRows: (data: ExportData) => Record<string, any>[];
  /**
   * Whether an import can write this sheet back.
   *
   * **The Matrix logs cannot.** The legacy importer handles ten targets and
   * has no branch for `MatrixLogs`, so the sheet is exported and can never be
   * restored — an admin who exports everything, loses something and
   * re-imports gets it all back *except* their Matrix history, with nothing
   * on screen saying so. Marked here so the preview can say it out loud.
   */
  importable: boolean;
}

/** Everything the sheets read. Absent collections export as empty. */
export interface ExportData {
  school?: any;
  profiles?: any[];
  /** `Player`s — run `fetchTeamRoster`'s rows through `toRoster` first. */
  players?: any[];
  schedule?: any[];
  drillsBank?: any[];
  practicePlan?: any[];
  activePlanName?: string;
  matrixLogs?: any[];
  coaches?: any[];
  thoughts?: any[];
  quiz?: any[];
  categories?: any[];
  /** The team name written into the row-level Team column. */
  teamName?: string;
}

/** Blank rather than a placeholder: an empty cell is honest, a default is not. */
const t = (v: any): string => (v === null || v === undefined ? '' : String(v));
const flag = (v: any): string => (v ? 'TRUE' : 'FALSE');
const yesNo = (v: any): string => (v ? 'YES' : 'NO');

export function tableDefs(): TableDef[] {
  return [
    {
      key: 'schools',
      fileName: '1_Schools_Config.xlsx',
      sheetName: 'Schools',
      headers: ['Code', 'Name', 'Mascot', 'City', 'League', 'PrimaryColor',
        'SecondaryColor', 'Wins', 'Losses', 'Draws', 'IsDeleted'],
      importable: true,
      toRows: (d) => {
        const s = d.school;
        // No row at all rather than a Beaumont-shaped one.
        if (!s) return [];
        return [{
          Code: t(s.code), Name: t(s.name), Mascot: t(s.mascot), City: t(s.city),
          League: t(s.league),
          PrimaryColor: t(s.colors?.primary), SecondaryColor: t(s.colors?.secondary),
          Wins: s.record?.wins ?? 0, Losses: s.record?.losses ?? 0, Draws: s.record?.draws ?? 0,
          IsDeleted: flag(s.is_deleted || s.isDeleted)
        }];
      }
    },
    {
      key: 'profiles',
      fileName: '2_User_Profiles.xlsx',
      sheetName: 'Profiles',
      headers: ['Username', 'Name', 'Role', 'PlayerId', 'SchoolCode', 'Approved', 'IsDeleted'],
      importable: true,
      // No invented users. The legacy fallback shipped coach_bob and sam_admin
      // into any export made before profiles had loaded.
      toRows: (d) => (d.profiles || []).map(u => ({
        Username: t(u.username || u.email), Name: t(u.name), Role: t(u.role),
        PlayerId: t(u.playerId || u.player_id), SchoolCode: t(u.schoolCode || u.school_code),
        Approved: yesNo(u.status ? u.status === 'active' : u.approved !== false),
        IsDeleted: flag(u.is_deleted || u.isDeleted)
      }))
    },
    {
      key: 'players',
      fileName: '3_Roster_Players.xlsx',
      sheetName: 'Players',
      headers: ['Team', 'Number', 'RecordingNumber', 'FirstName', 'LastName', 'Position',
        'Class', 'Height', 'Goals', 'Assists', 'Saves', 'CleanSheets',
        'Tech', 'Tactical', 'Physical', 'Mental', 'Photo', 'IsDeleted'],
      importable: true,
      // Reads a `Player` (domain/player-row.ts) and nothing else. The snake_case
      // fallbacks this once had guessed at a flat row no read returns, and hid
      // that the real roster row nests the person and was exporting blank.
      toRows: (d) => (d.players || []).map(p => ({
        Team: t(d.teamName), Number: p.number ?? '', RecordingNumber: p.recordingNumber ?? '',
        FirstName: t(p.firstName), LastName: t(p.lastName),
        Position: p.position ?? '', Class: t(p.classYear), Height: t(p.height),
        Goals: p.seasonStats?.goals ?? '', Assists: p.seasonStats?.assists ?? '',
        Saves: p.seasonStats?.saves ?? '', CleanSheets: p.seasonStats?.cleanSheets ?? '',
        Tech: p.ratings?.technical ?? '', Tactical: p.ratings?.tactical ?? '',
        Physical: p.ratings?.physical ?? '', Mental: p.ratings?.mental ?? '',
        Photo: t(p.photo), IsDeleted: flag(p.is_deleted || p.isDeleted)
      }))
    },
    {
      key: 'schedule',
      fileName: '4_Schedule_Results.xlsx',
      sheetName: 'Schedule',
      headers: ['Team', 'Date', 'Time', 'Opponent', 'Location', 'Address',
        'Home', 'Status', 'Score', 'IsDeleted'],
      importable: true,
      toRows: (d) => (d.schedule || []).map(m => ({
        Team: t(d.teamName), Date: t(m.date), Time: t(m.time), Opponent: t(m.opponent),
        Location: t(m.location), Address: t(m.venueAddress || m.venue_address),
        Home: (m.isHome ?? m.is_home) ? 'Home' : 'Away',
        Status: t(m.status), Score: t(m.score),
        IsDeleted: flag(m.is_deleted || m.isDeleted)
      }))
    },
    {
      key: 'drills',
      fileName: '5_Master_Drills_Library.xlsx',
      sheetName: 'MasterDrills',
      headers: ['Name', 'Category', 'CoachNotes', 'IsDeleted'],
      importable: true,
      toRows: (d) => (d.drillsBank || []).map(x => ({
        Name: t(x.name), Category: t(x.category),
        CoachNotes: t(x.coachNotes || x.coach_notes),
        IsDeleted: flag(x.is_deleted || x.isDeleted)
      }))
    },
    {
      key: 'plan',
      fileName: '6_Practice_Plans.xlsx',
      sheetName: 'PracticePlans',
      headers: ['PlanName', 'TimeSlot', 'DrillName', 'Duration', 'CoachNotes', 'IsDeleted'],
      importable: true,
      toRows: (d) => (d.practicePlan || []).map(x => ({
        PlanName: t(d.activePlanName), TimeSlot: t(x.time), DrillName: t(x.name),
        Duration: t(x.duration), CoachNotes: t(x.coachNotes),
        IsDeleted: flag(x.is_deleted || x.isDeleted)
      }))
    },
    {
      key: 'matrix',
      fileName: '7_Matrix_Logs.xlsx',
      sheetName: 'MatrixLogs',
      headers: ['PlayerName', 'DrillName', 'Result', 'OpponentName', 'ScoreText', 'Date', 'IsDeleted'],
      // Export only -- see `importable` on TableDef.
      importable: false,
      // No sample row. The legacy export substituted a fabricated result when
      // a team had none, which a re-import would have written in as real.
      toRows: (d) => (d.matrixLogs || []).map(l => ({
        PlayerName: t(l.playerName), DrillName: t(l.drillName), Result: t(l.result),
        OpponentName: t(l.opponentName), ScoreText: t(l.scoreText), Date: t(l.date),
        IsDeleted: flag(l.is_deleted || l.isDeleted)
      }))
    },
    {
      key: 'coaches',
      fileName: '8_Coaching_Staff.xlsx',
      sheetName: 'Coaches',
      headers: ['Name', 'Level', 'Phone', 'Email', 'Address', 'Bio', 'Photo', 'IsDeleted'],
      importable: true,
      toRows: (d) => (d.coaches || []).map(c => ({
        Name: t(c.name), Level: t(c.level), Phone: t(c.phone), Email: t(c.email),
        Address: t(c.address), Bio: t(c.bio), Photo: t(c.photo || c.photo_url),
        IsDeleted: flag(c.is_deleted || c.isDeleted)
      }))
    },
    {
      key: 'thoughts',
      fileName: '9_Coach_Daily_Thoughts.xlsx',
      sheetName: 'DailyThoughts',
      headers: ['CoachName', 'Title', 'ThoughtsText', 'IsActive', 'CreatedAt', 'IsDeleted'],
      importable: true,
      toRows: (d) => (d.thoughts || []).map(x => ({
        CoachName: t(x.coachName || x.coach_name), Title: t(x.title),
        ThoughtsText: t(x.text || x.thoughts_text),
        IsActive: yesNo(x.isActive ?? x.is_active),
        CreatedAt: t(x.createdAt || x.created_at),
        IsDeleted: flag(x.is_deleted || x.isDeleted)
      }))
    },
    {
      key: 'quiz',
      fileName: '10_Quiz_Questions.xlsx',
      sheetName: 'QuizQuestions',
      headers: ['QuestionText', 'OptionA', 'OptionB', 'OptionC', 'OptionD',
        'CorrectAnswer', 'Explanation', 'IsDeleted'],
      importable: true,
      // The real bank. The legacy export shipped one hardcoded sample question
      // every time, whatever the organization had written.
      toRows: (d) => (d.quiz || []).map(q => {
        const byLetter = new Map(
          (q.answers || []).map((a: any) => [String(a.letter).toUpperCase(), a]));
        const textOf = (letter: string) => {
          const a: any = byLetter.get(letter);
          return t(a?.text ?? a?.answer_text);
        };
        const correct = (q.answers || [])
          .find((a: any) => a.isCorrect || a.is_correct)?.letter || q.correct_option;

        return {
          QuestionText: t(q.question),
          OptionA: textOf('A'), OptionB: textOf('B'),
          OptionC: textOf('C'), OptionD: textOf('D'),
          CorrectAnswer: t(correct).toUpperCase(),
          Explanation: t(q.explanation),
          IsDeleted: flag(q.is_deleted || q.isDeleted)
        };
      })
    },
    {
      key: 'categories',
      fileName: '11_Soccer_Categories.xlsx',
      sheetName: 'SoccerCategories',
      headers: ['Name', 'Description', 'IsDeleted'],
      importable: true,
      toRows: (d) => (d.categories || []).map(c => ({
        Name: t(c.name), Description: t(c.description),
        IsDeleted: flag(c.is_deleted || c.isDeleted)
      }))
    }
  ];
}

/** One table's rows. Empty when the table is empty — that is the message. */
export function sheetFor(def: TableDef, data: ExportData): Record<string, any>[] {
  return def.toRows(data || {});
}

/** A blank row carrying every header, which is what a template is. */
export function templateFor(def: TableDef): Record<string, any>[] {
  return [Object.fromEntries(def.headers.map(h => [h, '']))];
}

export function tableByKey(key: string): TableDef | null {
  return tableDefs().find(d => d.key === key) || null;
}

export function tableBySheetName(sheetName: string): TableDef | null {
  const wanted = String(sheetName || '').trim().toLowerCase();
  return tableDefs().find(d => d.sheetName.toLowerCase() === wanted) || null;
}
