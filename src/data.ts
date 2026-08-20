/**
 * BHS Soccer - Default Seed Data
 * Typed as AppData for full IDE auto-complete and validation.
 */

import type { AppData } from './types';

export const DEFAULT_BHS_DATA: AppData = {
  school: {
    id: 'bhs',
    code: 'bhs',
    name: 'Beaumont High School',
    mascot: 'Cougars',
    city: 'Beaumont, CA',
    colors: { primary: '#0047AB', secondary: '#FFFFFF', navy: '#0A1428' },
    record: { wins: 9, losses: 1, draws: 2 }
  },
  players: [
    {
      id: 'p101',
      number: 10,
      name: 'Alex Rivera',
      position: 'Forward / CAM',
      classYear: 'Senior (2027)',
      height: "5'11\"",
      photo: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=400&q=80',
      seasonStats: { goals: 14, assists: 8, games: 12 },
      ratings: { technical: 92, tactical: 88, physical: 85, mental: 90 },
      matrixStats: { wins: 28, losses: 6, points: 94, rank: 1, drillScore: 92.4 }
    },
    {
      id: 'p102',
      number: 7,
      name: 'Marcus Vance',
      position: 'Winger',
      classYear: 'Junior (2028)',
      height: "5'9\"",
      photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
      seasonStats: { goals: 9, assists: 11, games: 12 },
      ratings: { technical: 89, tactical: 84, physical: 91, mental: 86 },
      matrixStats: { wins: 25, losses: 8, points: 86, rank: 2, drillScore: 89.1 }
    },
    {
      id: 'p103',
      number: 4,
      name: 'Ethan Thorne',
      position: 'Center Back',
      classYear: 'Senior (2027)',
      height: "6'2\"",
      photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
      seasonStats: { goals: 2, assists: 3, tackles: 42, games: 12 },
      ratings: { technical: 80, tactical: 92, physical: 94, mental: 91 },
      matrixStats: { wins: 23, losses: 9, points: 81, rank: 3, drillScore: 86.5 }
    },
    {
      id: 'p104',
      number: 1,
      name: 'Mateo Sandoval',
      position: 'Goalkeeper',
      classYear: 'Junior (2028)',
      height: "6'1\"",
      photo: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=400&q=80',
      seasonStats: { saves: 68, cleanSheets: 7, games: 12 },
      ratings: { technical: 86, tactical: 89, physical: 88, mental: 93 },
      matrixStats: { wins: 22, losses: 10, points: 79, rank: 4, drillScore: 84.8 }
    },
    {
      id: 'p105',
      number: 6,
      name: 'Lucas Sterling',
      position: 'Defensive Mid',
      classYear: 'Sophomore (2029)',
      height: "5'10\"",
      photo: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=400&q=80',
      seasonStats: { goals: 3, assists: 6, games: 11 },
      ratings: { technical: 85, tactical: 87, physical: 86, mental: 85 },
      matrixStats: { wins: 20, losses: 11, points: 72, rank: 5, drillScore: 81.2 }
    },
    {
      id: 'p106',
      number: 9,
      name: 'Jordan Brooks',
      position: 'Striker',
      classYear: 'Senior (2027)',
      height: "6'0\"",
      photo: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80',
      seasonStats: { goals: 11, assists: 2, games: 12 },
      ratings: { technical: 87, tactical: 82, physical: 88, mental: 84 },
      matrixStats: { wins: 19, losses: 12, points: 69, rank: 6, drillScore: 79.5 }
    }
  ],
  schedule: [
    {
      id: 'm201',
      date: 'AUG 12, 2026',
      time: '6:30 PM',
      opponent: 'Yucaipa Thunderbirds',
      location: 'Home - Cougar Stadium',
      status: 'UPCOMING',
      isHome: true
    },
    {
      id: 'm202',
      date: 'AUG 18, 2026',
      time: '5:00 PM',
      opponent: 'Citrus Valley Blackhawks',
      location: 'Away - Redlands, CA',
      status: 'UPCOMING',
      isHome: false
    },
    {
      id: 'm203',
      date: 'JUL 28, 2026',
      time: 'FINAL',
      opponent: 'Redlands East Valley',
      location: 'Home - Cougar Stadium',
      status: 'COMPLETED',
      score: '3 - 1',
      result: 'WIN'
    },
    {
      id: 'm204',
      date: 'JUL 22, 2026',
      time: 'FINAL',
      opponent: 'Palm Springs Indians',
      location: 'Away - Palm Springs',
      status: 'COMPLETED',
      score: '2 - 0',
      result: 'WIN'
    }
  ],
  drillsBank: [
    { id: 'd1', name: '1v1 Gauntlet (Continuous)', category: 'Competitive Matrix 1v1', coachNotes: 'Log 1v1 win/loss scores into Matrix' },
    { id: 'd2', name: '2v2 Flying Scrimmage with Bumpers', category: 'Small Sided', coachNotes: 'High intensity transition' },
    { id: 'd3', name: 'Finishing under High Pressure', category: 'Technical / Shooting', coachNotes: 'Focus on clean striking and follow-through under defensive pressure.' },
    { id: 'd4', name: '12-Minute Cooper Fitness Test', category: 'Physical Conditioning', coachNotes: 'Maximum aerobic effort test' },
    { id: 'd5', name: '7v7 Tactical Match Play', category: 'Full Scrimmage', coachNotes: 'Applying press triggers' },
    { id: 'd_dummy_1', name: 'Dummy Drill A: High Pressing Counter', category: 'Tactical / Pressing', coachNotes: 'Trigger high press on wide fullback touch.' },
    { id: 'd_dummy_2', name: 'Dummy Drill B: Overlapping Fullbacks 3v2', category: 'Attacking Width', coachNotes: 'Overlap timing from LB/RB into crossing zone.' },
    { id: 'd_dummy_3', name: 'Dummy Drill C: Quick Wall-Pass Combination', category: 'Technical / Passing', coachNotes: '1-touch wall pass combination in tight central space.' }
  ],
  currentPracticePlan: [
    { time: '4:00 PM - 4:15 PM', name: 'Dynamic Warmup & Rondo (5v2)', duration: '15 min', coachNotes: 'Focus on 1-touch speed & communication' },
    { time: '4:15 PM - 4:35 PM', name: 'Dummy Drill A: High Pressing Counter', duration: '20 min', coachNotes: 'Trigger high press on wide fullback touch.' },
    { time: '4:35 PM - 5:00 PM', name: 'Dummy Drill B: Overlapping Fullbacks 3v2', duration: '25 min', coachNotes: 'Overlap timing from LB/RB into crossing zone.' },
    { time: '5:00 PM - 5:15 PM', name: 'Dummy Drill C: Quick Wall-Pass Combination', duration: '15 min', coachNotes: '1-touch wall pass combination in tight central space.' },
    { time: '5:15 PM - 5:40 PM', name: '7v7 Tactical Match Play', duration: '25 min', coachNotes: 'Applying press triggers in game scenario.' },
    { time: '5:40 PM - 5:45 PM', name: 'Cool Down & Matrix Leaderboard Review', duration: '5 min', coachNotes: 'Announce Competitor of the Day' }
  ],
  savedPlans: [
    {
      id: 'plan_dummy_1',
      name: 'dummy_practice_1',
      date: 'AUG 6, 2026',
      drills: [
        { time: '4:00 PM - 4:15 PM', name: 'Dynamic Warmup & Rondo (5v2)', duration: '15 min', coachNotes: 'Focus on 1-touch speed & communication' },
        { time: '4:15 PM - 4:35 PM', name: 'Dummy Drill A: High Pressing Counter', duration: '20 min', coachNotes: 'Trigger high press on wide fullback touch.' },
        { time: '4:35 PM - 5:00 PM', name: 'Dummy Drill B: Overlapping Fullbacks 3v2', duration: '25 min', coachNotes: 'Overlap timing from LB/RB into crossing zone.' },
        { time: '5:00 PM - 5:15 PM', name: 'Dummy Drill C: Quick Wall-Pass Combination', duration: '15 min', coachNotes: '1-touch wall pass combination in tight central space.' },
        { time: '5:15 PM - 5:40 PM', name: '7v7 Tactical Match Play', duration: '25 min', coachNotes: 'Applying press triggers in game scenario.' },
        { time: '5:40 PM - 5:45 PM', name: 'Cool Down & Matrix Leaderboard Review', duration: '5 min', coachNotes: 'Announce Competitor of the Day' }
      ]
    },
    {
      id: 'plan_default_1',
      name: 'Standard Varsity 90-Min High Intensity',
      date: 'AUG 1, 2026',
      drills: [
        { time: '4:00 PM - 4:15 PM', name: 'Dynamic Warmup & Rondo (5v2)', duration: '15 min', coachNotes: 'Focus on 1-touch speed & communication' },
        { time: '4:15 PM - 4:35 PM', name: '1v1 Gauntlet (Continuous)', duration: '20 min', coachNotes: 'Log 1v1 win/loss scores into Matrix' },
        { time: '4:35 PM - 5:00 PM', name: '2v2 Flying Scrimmage with Bumpers', duration: '25 min', coachNotes: 'High intensity transition' },
        { time: '5:00 PM - 5:25 PM', name: '7v7 Tactical Match Play', duration: '25 min', coachNotes: 'Applying press triggers' },
        { time: '5:25 PM - 5:30 PM', name: 'Cool Down & Matrix Leaderboard Review', duration: '5 min', coachNotes: 'Announce Competitor of the Day' }
      ]
    }
  ],
  activePlanName: 'dummy_practice_1',
  coaches: [
    {
      id: 'c1',
      name: 'Coach Bob Miller',
      level: 'Boys Varsity Head Coach',
      phone: '(951) 555-0199',
      address: '39139 Cherry Valley Blvd, Beaumont, CA 92223',
      email: 'bob.miller@bhs-cougars.org',
      photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
      bio: 'Head Varsity Soccer Coach entering 8th season at Beaumont High School.'
    },
    {
      id: 'c2',
      name: 'Coach Dave Ramirez',
      level: 'JV Head Coach / Assistant Varsity',
      phone: '(951) 555-0188',
      address: '39139 Cherry Valley Blvd, Beaumont, CA 92223',
      email: 'dave.ramirez@bhs-cougars.org',
      photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
      bio: 'JV Head Coach focusing on tactical development, pressing triggers, and player progression.'
    }
  ],
  dailyThoughts: [
    {
      id: 'dt1',
      coachId: 'c1',
      coachName: 'Coach Bob Miller',
      text: 'Focus on high-intensity transition, quick 1-touch ball circulation, and aggressive pressing triggers ahead of our upcoming Citrus Belt League match. Hydrate well and bring maximum energy to practice today!',
      isActive: true,
      createdAt: 'AUG 2, 2026'
    }
  ],
  soccerCategories: [
    { id: 'cat_1', name: 'Tactical / Attacking', description: 'Drills focused on offensive build-up, 1v1 gauntlets, overlapping runs, counter-pressing, and finishing in the box.' },
    { id: 'cat_2', name: 'Defending / Pressing', description: 'Drills focusing on backline compact shape, high pressing triggers, defensive 1v1 containment, and tackling form.' },
    { id: 'cat_3', name: 'Technical / Passing', description: 'Drills highlighting ball control, quick 2-touch wall passes, weight of pass, and receiving under pressure.' },
    { id: 'cat_4', name: 'Physical / Conditioning', description: 'High-intensity fitness intervals, shuttle runs, agility ladder work, speed endurance, and core strength.' },
    { id: 'cat_5', name: 'Warmup & Rondo', description: 'Dynamic mobility warmups, 5v2 / 4v2 rondos, activation patterns, and touch refinement.' },
    { id: 'cat_6', name: 'Set Pieces / Penalty', description: 'Corner kick routines, free kick wall placement, long throw-ins, and penalty shootout practice.' }
  ]
};
