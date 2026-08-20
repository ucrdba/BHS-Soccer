/**
 * BHS Soccer - Shared Type Definitions
 * All domain interfaces for the application data model.
 */

// ─── Player & Stats ──────────────────────────────────────────────────────────

export interface SeasonStats {
  goals?: number;
  assists?: number;
  games?: number;
  saves?: number;
  cleanSheets?: number;
  tackles?: number;
}

export interface PlayerRatings {
  technical: number;
  tactical: number;
  physical: number;
  mental: number;
}

export interface MatrixStats {
  wins: number;
  losses: number;
  points: number;
  rank: number;
  drillScore: number;
}

export interface Player {
  id: string;
  number: number;
  name: string;
  position: string;
  classYear: string;
  height: string;
  photo: string;
  seasonStats: SeasonStats;
  ratings: PlayerRatings;
  matrixStats: MatrixStats;
  diagramData?: DiagramData | null;
  diagramImage?: string | null;
  bio?: string;
  isDeleted?: boolean;
}

// ─── Schedule ─────────────────────────────────────────────────────────────────

export type MatchStatus = 'UPCOMING' | 'COMPLETED' | 'CANCELLED';
export type MatchResult = 'WIN' | 'LOSS' | 'DRAW';

export interface Match {
  id: string;
  date: string;
  time: string;
  opponent: string;
  location: string;
  status: MatchStatus;
  isHome?: boolean;
  score?: string | null;
  result?: MatchResult | string | null;
  /** Raw ISO date (yyyy-mm-dd), kept alongside the display-formatted `date` so edit forms can round-trip. */
  rawDate?: string;
  /** Raw 24h time (HH:mm), kept alongside the display-formatted `time` so edit forms can round-trip. */
  rawTime?: string;
  isDeleted?: boolean;
}

// ─── Drills & Practice Plans ─────────────────────────────────────────────────

export interface Drill {
  id: string;
  name: string;
  category: string;
  duration?: string;
  points?: number;
  coachNotes?: string;
  diagramImage?: string | null;
  diagramData?: DiagramData | null;
}

export interface PlanDrill {
  time: string;
  name: string;
  duration: string;
  coachNotes: string;
  diagramImage?: string | null;
  diagramData?: DiagramData | null;
}

export interface PracticePlan {
  id: string;
  name: string;
  date: string;
  drills: PlanDrill[];
}

// ─── Coaches ─────────────────────────────────────────────────────────────────

export interface Coach {
  id: string;
  name: string;
  level: string;
  phone: string;
  address: string;
  email: string;
  photo: string;
  bio: string;
  schoolCode?: string;
}

// ─── Daily Thoughts & Quiz ───────────────────────────────────────────────────

export interface DailyThought {
  id: string;
  coachId: string;
  coachName: string;
  text: string;
  isActive: boolean;
  createdAt: string;
}

export interface QuizQuestion {
  question_id: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: 'A' | 'B' | 'C' | 'D';
  explanation?: string;
  category?: string;
}

// ─── School / Multi-tenant ───────────────────────────────────────────────────

export interface SchoolColors {
  primary: string;
  secondary: string;
  navy?: string;
}

export interface SchoolRecord {
  wins: number;
  losses: number;
  draws: number;
}

export interface School {
  id: string;
  code: string;
  name: string;
  mascot: string;
  city: string;
  colors: SchoolColors;
  record: SchoolRecord;
}

export interface SoccerCategory {
  id: string;
  name: string;
  description: string;
}

// ─── App Data Root ───────────────────────────────────────────────────────────

export interface AppData {
  school: School;
  schools?: School[];
  players: Player[];
  schedule: Match[];
  drillsBank: Drill[];
  currentPracticePlan: PlanDrill[];
  savedPlans: PracticePlan[];
  activePlanName: string;
  coaches: Coach[];
  dailyThoughts: DailyThought[];
  soccerCategories: SoccerCategory[];
}

// ─── Auth / Users ────────────────────────────────────────────────────────────

export type UserRole = 'guest' | 'player' | 'coach' | 'admin';
export type UserStatus = 'active' | 'pending_verification' | 'pending_approval' | 'rejected';

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  requestedRole?: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  verificationCode?: string;
  schoolId: string;
  schoolName: string;
  teamLevel: string;
  playerId?: string;
  avatar?: string;
  createdAt?: string;
}

export interface LoginResult {
  success: boolean;
  user?: AppUser;
  message?: string;
  isPendingVerification?: boolean;
  isPendingApproval?: boolean;
}

export interface RegisterResult {
  success: boolean;
  user?: AppUser;
  message?: string;
  requiresVerification?: boolean;
  requiresApproval?: boolean;
  isExisting?: boolean;
  otpCode?: string;
}

export interface OtpVerifyResult {
  success: boolean;
  user?: AppUser;
  status?: UserStatus;
  message?: string;
}

// ─── Tactical Diagrammer ─────────────────────────────────────────────────────

export type DiagramTool =
  | 'attacker' | 'defender' | 'gk' | 'ball' | 'cone' | 'goal' | 'text'
  | 'select' | 'eraser'
  | 'line_solid' | 'line_arrow' | 'line_dashed' | 'line_dribble' | 'line_shot';

export type DiagramLineTool = 'line_solid' | 'line_arrow' | 'line_dashed' | 'line_dribble' | 'line_shot';

export type PitchType = 'full' | 'half';

export interface DiagramElement {
  id: number;
  type: 'attacker' | 'defender' | 'gk' | 'ball' | 'cone' | 'goal' | 'text';
  x: number;
  y: number;
  color: string;
  number?: string;
  text?: string;
}

export interface DiagramPoint {
  x: number;
  y: number;
}

export interface DiagramDrawing {
  tool: DiagramLineTool;
  points: DiagramPoint[];
  color: string;
  width?: number;
}

export interface DiagramKeyframe {
  time: number;
  label: string;
  elements: DiagramElement[];
  drawings: DiagramDrawing[];
}

export interface DiagramData {
  keyframes: DiagramKeyframe[];
  currentFrameIndex: number;
  elements: DiagramElement[];
  drawings: DiagramDrawing[];
  pitchType: PitchType;
}

// ─── Countdown ───────────────────────────────────────────────────────────────

export interface Countdown {
  days: string;
  hours: string;
  mins: string;
}

// ─── Modal helpers ───────────────────────────────────────────────────────────

export interface PromptModalOptions {
  title: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  onConfirm: (value: string) => void;
  onCancel?: () => void;
}

export interface ConfirmModalOptions {
  title: string;
  message: string;
  confirmText?: string;
  confirmClass?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}
