// src/main.ts
import { supabaseService } from './data/supabase';

// `window.supabaseService` is already declared (as `SupabaseServiceLike`) in
// src/globals.d.ts, ambient-typing the classic scripts that still read this
// global. `supabaseService` structurally satisfies that interface, so no
// redeclaration is needed here — TS forbids two `declare global` blocks from
// giving the same Window property different types (TS2717).
window.supabaseService = supabaseService;
