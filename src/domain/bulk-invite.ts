/**
 * Inviting a whole squad from a pasted list.
 *
 * A coach has the addresses in a spreadsheet, an email or a message, so the
 * reading is forgiving: "address, name", "Name <address>", a tab-separated
 * pair, or an address on its own. What it then does with each line is not
 * forgiving at all. An invitation is authorization to join a squad, so a name
 * that matches nobody, or two players at once, is **named rather than
 * guessed at** -- a wrong match hands one player's place to another.
 *
 * Pure: the roster, who already has an account and which invitations are open
 * are all passed in. The screen shows every line and its outcome before
 * anything is sent, and only the `invite` ones are.
 */

export interface PastedLine {
  /** 1-based, counting the blank and skipped lines too, so it names the row a coach sees. */
  line: number;
  raw: string;
  /** Lowercased; empty when the line held no address. */
  email: string;
  name: string;
}

export type InviteOutcome =
  | 'invite'      // matched a roster entry with no account and no open invitation
  | 'choose'      // an address with no name: the coach picks the roster entry
  | 'linked'      // that player already has an account
  | 'invited'     // that player, or that address, is already invited
  | 'no-match'    // no roster entry of that name
  | 'ambiguous'   // more than one roster entry of that name
  | 'bad-email'   // not an address
  | 'duplicate';  // this address, or this player, appears earlier in the list

export interface PlannedInvite extends PastedLine {
  outcome: InviteOutcome;
  playerId: string | null;
  playerName: string;
  /** One sentence, as the screen shows it. */
  note: string;
}

export interface RosterEntry { id: string; name: string }

/** Deliberately loose: the database and the mailer are the real judges. */
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

/**
 * A header row a spreadsheet paste brings along, which is not a player. Every
 * field has to be a header word: "not-an-address" is a line to report, not a
 * heading to skip.
 */
const HEADER_WORD = /^(e-?mail|e-?mail address|address|name|player|full name|first|last)$/i;

function isHeader(text: string): boolean {
  if (text.includes('@')) return false;
  const fields = text.split(/[,;\t]+/).map(f => f.trim()).filter(Boolean);
  return fields.length > 0 && fields.every(f => HEADER_WORD.test(f));
}

/**
 * Names match on their letters and digits alone: case, spacing, punctuation
 * and accents all vary between a roster and a coach's spreadsheet. "Alva,
 * Cesar" is compared as its parts sorted, so surname-first reads the same as
 * first-name-first.
 */
function nameKey(name: string): string {
  const plain = String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return plain.slice().sort().join(' ');
}

export function parseInviteList(text: string): PastedLine[] {
  const out: PastedLine[] = [];

  String(text || '').split(/\r?\n/).forEach((raw, i) => {
    const trimmed = raw.trim();
    if (!trimmed || isHeader(trimmed)) return;

    // Whichever field carries the @ is the address; everything else is the
    // name, joined back up so "Alva, Cesar" survives the split.
    const fields = trimmed.split(/[,;\t]+|\s+(?=<)/).map(f => f.trim()).filter(Boolean);
    const emailAt = fields.findIndex(f => f.includes('@'));

    let email = '';
    let nameParts = fields;
    if (emailAt >= 0) {
      const field = fields[emailAt];
      // "Name <address>" arrives as one field when there is no comma.
      const angled = field.match(/<([^>]*)>/);
      if (angled) {
        email = angled[1].trim().toLowerCase();
        const rest = field.replace(/<[^>]*>/, '').trim();
        nameParts = fields.filter((_, k) => k !== emailAt).concat(rest ? [rest] : []);
      } else {
        email = field.toLowerCase();
        nameParts = fields.filter((_, k) => k !== emailAt);
      }
    }

    out.push({ line: i + 1, raw: trimmed, email, name: nameParts.join(', ').trim() });
  });

  return out;
}

export interface BulkInviteInput {
  lines: PastedLine[];
  roster: RosterEntry[];
  /** Roster entries that already have an account. */
  linkedIds: string[];
  /** Open invitations to this team. */
  invitations: Array<{ email?: string; player_id?: string | null; role?: string }>;
  /** A roster entry the coach picked for a line with no name, by line number. */
  chosen?: Record<number, string>;
}

export function planBulkInvites(input: BulkInviteInput): PlannedInvite[] {
  const roster = input.roster || [];
  const linked = new Set(input.linkedIds || []);
  const invitedPlayers = new Set(
    (input.invitations || []).filter(i => i.player_id).map(i => String(i.player_id)));
  const invitedEmails = new Set(
    (input.invitations || []).map(i => String(i.email || '').trim().toLowerCase()).filter(Boolean));
  const chosen = input.chosen || {};

  const byName = new Map<string, RosterEntry[]>();
  roster.forEach(p => {
    const key = nameKey(p.name);
    byName.set(key, (byName.get(key) || []).concat(p));
  });

  const seenEmails = new Set<string>();
  const seenPlayers = new Set<string>();

  return (input.lines || []).map(line => {
    const at = (outcome: InviteOutcome, note: string, player: RosterEntry | null = null): PlannedInvite => ({
      ...line, outcome, note, playerId: player?.id ?? null, playerName: player?.name ?? ''
    });

    if (!EMAIL.test(line.email)) {
      return at('bad-email', line.email
        ? `“${line.email}” is not an email address.`
        : 'No email address on this line.');
    }

    if (seenEmails.has(line.email)) {
      return at('duplicate', 'This address is already on an earlier line.');
    }

    let player: RosterEntry | null = null;
    if (chosen[line.line]) {
      player = roster.find(p => p.id === chosen[line.line]) || null;
    } else if (line.name) {
      const found = byName.get(nameKey(line.name)) || [];
      if (found.length > 1) {
        seenEmails.add(line.email);
        return at('ambiguous', `More than one player is called ${line.name}. Choose which one.`);
      }
      player = found[0] || null;
      if (!player) {
        seenEmails.add(line.email);
        return at('no-match', 'No player of that name on this squad.');
      }
    } else {
      seenEmails.add(line.email);
      return at('choose', 'Choose the player this address belongs to.');
    }

    seenEmails.add(line.email);
    if (!player) return at('choose', 'Choose the player this address belongs to.');

    if (linked.has(player.id)) {
      return at('linked', `${player.name} already has an account.`, player);
    }
    if (invitedPlayers.has(player.id) || invitedEmails.has(line.email)) {
      return at('invited', `${player.name} has already been invited; that invitation is left alone.`, player);
    }
    if (seenPlayers.has(player.id)) {
      return at('duplicate', `${player.name} is already on an earlier line.`, player);
    }

    seenPlayers.add(player.id);
    return at('invite', `Will be invited as ${player.name}.`, player);
  });
}
