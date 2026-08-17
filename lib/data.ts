import type {
  Club,
  Course,
  Group,
  HistoryEntry,
  Player,
  Tournament,
} from "./types";

/* ------------------------------------------------------------------ */
/* Clubs                                                               */
/* ------------------------------------------------------------------ */

export const CLUBS: Club[] = [
  { id: "muthaiga", name: "Muthaiga Golf Club", short: "Muthaiga", town: "Nairobi" , lat: -1.2496, lng: 36.8399 },
  { id: "karen", name: "Karen Country Club", short: "Karen", town: "Nairobi" , lat: -1.3323, lng: 36.7132 },
  { id: "windsor", name: "Windsor Golf Hotel & Country Club", short: "Windsor", town: "Nairobi" , lat: -1.2094, lng: 36.8434 },
  { id: "sigona", name: "Sigona Golf Club", short: "Sigona", town: "Kikuyu" , lat: -1.2222, lng: 36.641 },
  { id: "royal-nairobi", name: "Royal Nairobi Golf Club", short: "Royal Nairobi", town: "Nairobi" , lat: -1.307, lng: 36.8082 },
  { id: "thika", name: "Thika Sports Club", short: "Thika", town: "Thika" , lat: -1.049, lng: 37.094 },
  { id: "nyali", name: "Nyali Golf & Country Club", short: "Nyali", town: "Mombasa" , lat: -4.0289, lng: 39.7086 },
  { id: "vetlab", name: "Vet Lab Sports Club", short: "Vet Lab", town: "Nairobi" , lat: -1.2531, lng: 36.7592 },
  { id: "limuru", name: "Limuru Country Club", short: "Limuru", town: "Limuru" , lat: -1.1043, lng: 36.6421 },
];

export const clubById = (id: string) => CLUBS.find((c) => c.id === id)!;

/* ------------------------------------------------------------------ */
/* Courses (Muthaiga fully detailed - yellow tees)                     */
/* ------------------------------------------------------------------ */

const MUTHAIGA_HOLES = [
  { hole: 1, par: 4, si: 7, yards: 378 },
  { hole: 2, par: 5, si: 15, yards: 486 },
  { hole: 3, par: 4, si: 3, yards: 411 },
  { hole: 4, par: 3, si: 17, yards: 156 },
  { hole: 5, par: 4, si: 1, yards: 432 },
  { hole: 6, par: 4, si: 11, yards: 368 },
  { hole: 7, par: 3, si: 13, yards: 172 },
  { hole: 8, par: 5, si: 9, yards: 512 },
  { hole: 9, par: 4, si: 5, yards: 401 },
  { hole: 10, par: 4, si: 8, yards: 392 },
  { hole: 11, par: 4, si: 2, yards: 428 },
  { hole: 12, par: 3, si: 16, yards: 148 },
  { hole: 13, par: 5, si: 12, yards: 495 },
  { hole: 14, par: 4, si: 4, yards: 415 },
  { hole: 15, par: 4, si: 10, yards: 377 },
  { hole: 16, par: 3, si: 18, yards: 139 },
  { hole: 17, par: 5, si: 14, yards: 501 },
  { hole: 18, par: 4, si: 6, yards: 405 },
];

export const COURSES: Course[] = [
  { id: "muthaiga-main", clubId: "muthaiga", name: "Muthaiga Main Course", tees: "Yellow", par: 72, holes: MUTHAIGA_HOLES, ratings: [ { tee: "White", courseRating: 73.2, slope: 133 }, { tee: "Yellow", courseRating: 71.8, slope: 129 }, { tee: "Blue", courseRating: 74.1, slope: 136 }, { tee: "Red", courseRating: 69.5, slope: 122 } ] },
  { id: "karen-main", clubId: "karen", name: "Karen Championship Course", tees: "Yellow", par: 72, holes: MUTHAIGA_HOLES, ratings: [ { tee: "White", courseRating: 73.2, slope: 133 }, { tee: "Yellow", courseRating: 71.8, slope: 129 }, { tee: "Blue", courseRating: 74.1, slope: 136 }, { tee: "Red", courseRating: 69.5, slope: 122 } ] },
  { id: "sigona-main", clubId: "sigona", name: "Sigona Main Course", tees: "Yellow", par: 71, holes: MUTHAIGA_HOLES, ratings: [ { tee: "White", courseRating: 73.2, slope: 133 }, { tee: "Yellow", courseRating: 71.8, slope: 129 }, { tee: "Blue", courseRating: 74.1, slope: 136 }, { tee: "Red", courseRating: 69.5, slope: 122 } ] },
  { id: "windsor-main", clubId: "windsor", name: "Windsor Championship Course", tees: "Yellow", par: 72, holes: MUTHAIGA_HOLES, ratings: [ { tee: "White", courseRating: 73.2, slope: 133 }, { tee: "Yellow", courseRating: 71.8, slope: 129 }, { tee: "Blue", courseRating: 74.1, slope: 136 }, { tee: "Red", courseRating: 69.5, slope: 122 } ] },
  { id: "royal-main", clubId: "royal-nairobi", name: "Royal Nairobi Main Course", tees: "Yellow", par: 72, holes: MUTHAIGA_HOLES, ratings: [ { tee: "White", courseRating: 73.2, slope: 133 }, { tee: "Yellow", courseRating: 71.8, slope: 129 }, { tee: "Blue", courseRating: 74.1, slope: 136 }, { tee: "Red", courseRating: 69.5, slope: 122 } ] },
  { id: "thika-main", clubId: "thika", name: "Thika Main Course", tees: "Yellow", par: 70, holes: MUTHAIGA_HOLES, ratings: [ { tee: "White", courseRating: 73.2, slope: 133 }, { tee: "Yellow", courseRating: 71.8, slope: 129 }, { tee: "Blue", courseRating: 74.1, slope: 136 }, { tee: "Red", courseRating: 69.5, slope: 122 } ] },
  { id: "nyali-main", clubId: "nyali", name: "Nyali Main Course", tees: "Yellow", par: 71, holes: MUTHAIGA_HOLES, ratings: [ { tee: "White", courseRating: 73.2, slope: 133 }, { tee: "Yellow", courseRating: 71.8, slope: 129 }, { tee: "Blue", courseRating: 74.1, slope: 136 }, { tee: "Red", courseRating: 69.5, slope: 122 } ] },
  { id: "vetlab-main", clubId: "vetlab", name: "Vet Lab Main Course", tees: "Yellow", par: 72, holes: MUTHAIGA_HOLES, ratings: [ { tee: "White", courseRating: 73.2, slope: 133 }, { tee: "Yellow", courseRating: 71.8, slope: 129 }, { tee: "Blue", courseRating: 74.1, slope: 136 }, { tee: "Red", courseRating: 69.5, slope: 122 } ] },
  { id: "limuru-main", clubId: "limuru", name: "Limuru Main Course", tees: "Yellow", par: 71, holes: MUTHAIGA_HOLES, ratings: [ { tee: "White", courseRating: 73.2, slope: 133 }, { tee: "Yellow", courseRating: 71.8, slope: 129 }, { tee: "Blue", courseRating: 74.1, slope: 136 }, { tee: "Red", courseRating: 69.5, slope: 122 } ] },
];

export const courseById = (id: string) => COURSES.find((c) => c.id === id)!;

/* ------------------------------------------------------------------ */
/* Players                                                             */
/* ------------------------------------------------------------------ */

export const DEMO_USER_ID = "p-joe";
export const MARKER_ID = "p-kamau-d";

const P = (
  id: string,
  name: string,
  clubId: string,
  handicap: number,
  gender: "M" | "F" = "M",
): Player => ({
  id,
  name,
  clubId,
  handicap,
  gender,
  phone: `+254 7${(id.length * 7 + handicap).toString().padStart(2, "0")} ${(100 + handicap * 7) % 900 + 100} ${(400 + id.charCodeAt(2) * 3) % 900 + 100}`,
  email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@gmail.com`,
});

export const PLAYERS: Player[] = [
  // - the demo user and his group -
  P(DEMO_USER_ID, "Joel Ouya", "muthaiga", 2),
  P(MARKER_ID, "David Kamau", "muthaiga", 14),
  P("p-wanjiku-g", "Grace Wanjiku", "karen", 9, "F"),
  // - the field -
  P("p-otieno-b", "Brian Otieno", "muthaiga", 4),
  P("p-njoroge-p", "Peter Njoroge", "muthaiga", 6),
  P("p-fraser-i", "Ian Fraser", "karen", 3),
  P("p-mwangi-k", "Kevin Mwangi", "sigona", 8),
  P("p-ochieng-s", "Samuel Ochieng", "royal-nairobi", 2),
  P("p-karanja-j", "James Karanja", "muthaiga", 11),
  P("p-akinyi-f", "Faith Akinyi", "vetlab", 13, "F"),
  P("p-patel-r", "Rajiv Patel", "muthaiga", 7),
  P("p-njeri-c", "Catherine Njeri", "limuru", 16, "F"),
  P("p-kiprop-e", "Elias Kiprop", "thika", 10),
  P("p-vdmerwe-h", "Hannah van der Merwe", "karen", 15, "F"),
  P("p-mutua-d", "Dennis Mutua", "muthaiga", 24),
  P("p-wafula-m", "Michael Wafula", "windsor", 18),
  P("p-oconnor-j", "Declan O'Connor", "muthaiga", 9),
  P("p-chebet-m", "Mercy Chebet", "sigona", 20, "F"),
  P("p-gitau-s", "Stephen Gitau", "muthaiga", 5),
  P("p-omondi-v", "Victor Omondi", "nyali", 12),
  P("p-wairimu-n", "Nancy Wairimu", "muthaiga", 22, "F"),
  P("p-langat-c", "Collins Langat", "royal-nairobi", 14),
  P("p-shah-a", "Amit Shah", "muthaiga", 17),
  P("p-atieno-s", "Susan Atieno", "vetlab", 19, "F"),
  P("p-kimani-r", "Robert Kimani", "muthaiga", 8),
  P("p-barasa-t", "Timothy Barasa", "thika", 21),
  P("p-hughes-w", "William Hughes", "windsor", 13),
  P("p-nyambura-l", "Lucy Nyambura", "limuru", 25, "F"),
  P("p-odhiambo-g", "George Odhiambo", "nyali", 6),
  P("p-muriuki-a", "Anthony Muriuki", "muthaiga", 15),
  P("p-cherono-b", "Beatrice Cherono", "sigona", 11, "F"),
  P("p-kobayashi-y", "Yuki Kobayashi", "karen", 10),
  P("p-maina-f", "Francis Maina", "muthaiga", 19),
  P("p-adhiambo-p", "Pauline Adhiambo", "vetlab", 23, "F"),
  P("p-kariuki-t", "Tom Kariuki", "muthaiga", 16),
  P("p-simiyu-e", "Edwin Simiyu", "windsor", 28),
  // - extra members (roster only) -
  P("p-githinji-m", "Martin Githinji", "muthaiga", 20),
  P("p-anyango-r", "Rose Anyango", "muthaiga", 26, "F"),
  P("p-pereira-l", "Luis Pereira", "muthaiga", 9),
  P("p-mbugua-s", "Simon Mbugua", "muthaiga", 13),
  P("p-wambui-j", "Jane Wambui", "muthaiga", 18, "F"),
];

export const playerById = (id: string) => PLAYERS.find((p) => p.id === id)!;

/* ------------------------------------------------------------------ */
/* Tournaments                                                         */
/* ------------------------------------------------------------------ */

export const LIVE_TOURNAMENT_ID = "t-captains-prize";

export const TOURNAMENTS: Tournament[] = [
  {
    id: LIVE_TOURNAMENT_ID,
    name: "Muthaiga Captain's Prize",
    clubId: "muthaiga",
    courseId: "muthaiga-main",
    date: "2026-07-17",
    format: "Stableford",
    entryFee: 3500,
    status: "live",
    membersOnly: false,
    divisions: [
      { name: "Division A", range: [0, 9] },
      { name: "Division B", range: [10, 18] },
      { name: "Division C", range: [19, 28] },
    ],
    description:
      "The Captain's flagship day of the season. A full field, the course dressed for the occasion, and the Captain's table waiting at the 19th. Stableford off yellow tees; divisional prizes and the Captain's silver salver for the overall winner.",
    prizes: [
      { place: "Overall winner", prize: "The Captain's Salver + KES 30,000 pro shop credit" },
      { place: "Division winners", prize: "KES 15,000 pro shop credit" },
      { place: "Nearest the pin, 16th", prize: "A dozen Pro V1s" },
      { place: "Longest drive, 11th", prize: "Sunday bag, embroidered" },
    ],
    maxPlayers: 120,
    regCloses: "2026-07-15",
    handicapAllowance: 95,
    firstTee: "07:30",
    teeInterval: 10,
    fieldSize: 36,
    registered: true,
  },
  {
    id: "t-karen-midweek",
    name: "Karen Midweek Stableford",
    clubId: "karen",
    courseId: "karen-main",
    date: "2026-07-22",
    format: "Stableford",
    entryFee: 2500,
    status: "upcoming",
    membersOnly: false,
    maxHandicap: 24,
    divisions: [
      { name: "Division A", range: [0, 12] },
      { name: "Division B", range: [13, 24] },
    ],
    description:
      "Karen's beloved Wednesday roll-up, open to visiting players. A gentler start off the 1st, lunch on the veranda after. Handicap limit 24.",
    prizes: [
      { place: "Winner", prize: "KES 10,000 pro shop credit" },
      { place: "Runner-up", prize: "KES 5,000 pro shop credit" },
    ],
    maxPlayers: 80,
    regCloses: "2026-07-21",
    handicapAllowance: 95,
    firstTee: "08:00",
    teeInterval: 10,
    fieldSize: 54,
  },
  {
    id: "t-vetlab-medal",
    name: "Vet Lab Midweek Medal",
    clubId: "vetlab",
    courseId: "vetlab-main",
    date: "2026-07-23",
    format: "Stroke Play",
    entryFee: 2000,
    status: "upcoming",
    membersOnly: false,
    divisions: [{ name: "Overall", range: [0, 28] }],
    description:
      "A proper medal round at Vet Lab: every stroke counts and the card must come home signed. Open draw, all welcome.",
    prizes: [{ place: "Winner", prize: "KES 8,000 pro shop credit" }],
    maxPlayers: 60,
    regCloses: "2026-07-22",
    handicapAllowance: 95,
    firstTee: "07:30",
    teeInterval: 10,
    fieldSize: 41,
  },
  {
    id: "t-sigona-bowl",
    name: "NCBA Sigona Bowl",
    clubId: "sigona",
    courseId: "sigona-main",
    date: "2026-07-25",
    format: "Stroke Play",
    entryFee: 4000,
    status: "upcoming",
    membersOnly: false,
    divisions: [
      { name: "Division A", range: [0, 9] },
      { name: "Division B", range: [10, 18] },
      { name: "Division C", range: [19, 28] },
    ],
    description:
      "One of the oldest trophies in Kenyan golf, contested at Sigona since 1938. Two loops of a course that rewards patience; the kikuyu rough is unforgiving in July.",
    prizes: [
      { place: "Overall winner", prize: "The Sigona Bowl + KES 25,000" },
      { place: "Best gross", prize: "KES 12,000" },
    ],
    maxPlayers: 100,
    regCloses: "2026-07-23",
    handicapAllowance: 95,
    firstTee: "07:00",
    teeInterval: 10,
    fieldSize: 78,
    registered: true,
  },
  {
    id: "t-thika-mug",
    name: "Thika Monthly Mug",
    clubId: "thika",
    courseId: "thika-main",
    date: "2026-07-26",
    format: "Stroke Play",
    entryFee: 1500,
    status: "upcoming",
    membersOnly: true,
    divisions: [{ name: "Overall", range: [0, 28] }],
    description:
      "Members' monthly medal at Thika Sports Club. The mug, the honour, and a month of bragging rights.",
    prizes: [{ place: "Winner", prize: "The Mug + KES 5,000" }],
    maxPlayers: 60,
    regCloses: "2026-07-24",
    handicapAllowance: 95,
    firstTee: "07:30",
    teeInterval: 10,
    fieldSize: 38,
  },
  {
    id: "t-windsor-scramble",
    name: "Windsor Charity Scramble",
    clubId: "windsor",
    courseId: "windsor-main",
    date: "2026-08-01",
    format: "Scramble",
    entryFee: 6000,
    status: "upcoming",
    membersOnly: false,
    divisions: [{ name: "Teams", range: [0, 28] }],
    description:
      "Teams of four, one ball, and every shilling to the Windsor children's education fund. Shotgun start, dinner and auction to follow.",
    prizes: [
      { place: "Winning team", prize: "Weekend stay at Windsor Hotel" },
      { place: "Most money raised", prize: "The Giving Cup" },
    ],
    maxPlayers: 96,
    regCloses: "2026-07-30",
    handicapAllowance: 100,
    firstTee: "11:00",
    teeInterval: 0,
    fieldSize: 64,
  },
  {
    id: "t-kgu-oom-3",
    name: "KGU Order of Merit Round 3",
    clubId: "royal-nairobi",
    courseId: "royal-main",
    date: "2026-08-02",
    format: "Stroke Play",
    entryFee: 5000,
    status: "upcoming",
    membersOnly: false,
    maxHandicap: 18,
    divisions: [
      { name: "Division A", range: [0, 9] },
      { name: "Division B", range: [10, 18] },
    ],
    description:
      "Third leg of the Kenya Golf Union's national Order of Merit. Points count towards national squad selection. Handicap limit 18; gross and net honours.",
    prizes: [
      { place: "OoM points", prize: "Top 30 finishers" },
      { place: "Best gross", prize: "KGU medal + KES 20,000" },
    ],
    maxPlayers: 120,
    regCloses: "2026-07-30",
    handicapAllowance: 95,
    firstTee: "06:45",
    teeInterval: 10,
    fieldSize: 96,
  },
  {
    id: "t-limuru-ladies",
    name: "Limuru Ladies Open",
    clubId: "limuru",
    courseId: "limuru-main",
    date: "2026-08-08",
    format: "Stableford",
    entryFee: 3000,
    status: "upcoming",
    membersOnly: false,
    ladiesOnly: true,
    divisions: [
      { name: "Silver", range: [0, 14] },
      { name: "Bronze", range: [15, 28] },
    ],
    description:
      "The highlands' premier ladies' event: tea-estate air, quick greens, and the Limuru Rose Bowl for the overall winner.",
    prizes: [{ place: "Overall winner", prize: "The Limuru Rose Bowl" }],
    maxPlayers: 80,
    regCloses: "2026-08-06",
    handicapAllowance: 95,
    firstTee: "08:00",
    teeInterval: 10,
    fieldSize: 47,
  },
  {
    id: "t-nyali-classic",
    name: "Nyali Coast Classic",
    clubId: "nyali",
    courseId: "nyali-main",
    date: "2026-08-15",
    format: "Better Ball",
    entryFee: 3000,
    status: "upcoming",
    membersOnly: true,
    divisions: [{ name: "Pairs", range: [0, 28] }],
    description:
      "Fourball better ball by the Indian Ocean. Members and their guests; sea breeze guaranteed from the 12th.",
    prizes: [{ place: "Winning pair", prize: "KES 20,000 + the Coast Classic pennant" }],
    maxPlayers: 88,
    regCloses: "2026-08-13",
    handicapAllowance: 90,
    firstTee: "07:00",
    teeInterval: 10,
    fieldSize: 52,
  },
  // - completed -
  {
    id: "t-muthaiga-medal-july",
    name: "Muthaiga July Monthly Medal",
    clubId: "muthaiga",
    courseId: "muthaiga-main",
    date: "2026-07-05",
    format: "Stroke Play",
    entryFee: 1500,
    status: "completed",
    membersOnly: true,
    divisions: [{ name: "Overall", range: [0, 28] }],
    description: "July's members' medal.",
    prizes: [{ place: "Winner", prize: "The Medal" }],
    maxPlayers: 90,
    regCloses: "2026-07-03",
    handicapAllowance: 95,
    firstTee: "07:30",
    teeInterval: 10,
    fieldSize: 72,
    result: { winner: "Stephen Gitau", score: "net 68", userPosition: 12, userScore: "net 73" },
  },
  {
    id: "t-karen-qualifying",
    name: "Karen Club Championship Qualifying",
    clubId: "karen",
    courseId: "karen-main",
    date: "2026-06-27",
    format: "Stroke Play",
    entryFee: 2500,
    status: "completed",
    membersOnly: false,
    divisions: [{ name: "Overall", range: [0, 28] }],
    description: "Qualifying round for the club championship match play draw.",
    prizes: [{ place: "Medallist", prize: "Top seed" }],
    maxPlayers: 100,
    regCloses: "2026-06-25",
    handicapAllowance: 100,
    firstTee: "07:00",
    teeInterval: 10,
    fieldSize: 84,
    result: { winner: "Ian Fraser", score: "gross 71", userPosition: 8, userScore: "net 70" },
  },
  {
    id: "t-sigona-invitational",
    name: "Sigona Invitational",
    clubId: "sigona",
    courseId: "sigona-main",
    date: "2026-06-14",
    format: "Stableford",
    entryFee: 3000,
    status: "completed",
    membersOnly: false,
    divisions: [{ name: "Overall", range: [0, 28] }],
    description: "Invitational stableford at Sigona.",
    prizes: [{ place: "Winner", prize: "KES 15,000" }],
    maxPlayers: 80,
    regCloses: "2026-06-12",
    handicapAllowance: 95,
    firstTee: "07:30",
    teeInterval: 10,
    fieldSize: 66,
    result: { winner: "Beatrice Cherono", score: "41 pts", userPosition: 21, userScore: "33 pts" },
  },
];

/* ------------------------------------------------------------------ */
/* Groups for the live tournament (12 × 3, off 07:30 every 10 min)     */
/* ------------------------------------------------------------------ */

export const USER_GROUP_ID = "g5";

const teeTimeFor = (i: number) => {
  const start = 7 * 60 + 30 + i * 10;
  return `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`;
};

const G = (n: number, playerIds: string[], featured = false): Group => ({
  id: `g${n}`,
  number: n,
  teeTime: teeTimeFor(n - 1),
  playerIds,
  featured,
});

export const GROUPS: Group[] = [
  G(1, ["p-ochieng-s", "p-fraser-i", "p-otieno-b"], true), // marquee low-handicap group
  G(2, ["p-gitau-s", "p-njoroge-p", "p-odhiambo-g"]),
  G(3, ["p-patel-r", "p-kimani-r", "p-oconnor-j"]),
  G(4, ["p-mwangi-k", "p-kobayashi-y", "p-cherono-b"]),
  G(5, [DEMO_USER_ID, MARKER_ID, "p-wanjiku-g"], true), // the demo user's group
  G(6, ["p-karanja-j", "p-omondi-v", "p-kiprop-e"]),
  G(7, ["p-akinyi-f", "p-hughes-w", "p-langat-c"]),
  G(8, ["p-vdmerwe-h", "p-muriuki-a", "p-njeri-c"]),
  G(9, ["p-shah-a", "p-kariuki-t", "p-wafula-m"]),
  G(10, ["p-atieno-s", "p-maina-f", "p-mutua-d"], true), // Mutua - the anomaly story
  G(11, ["p-chebet-m", "p-barasa-t", "p-wairimu-n"]),
  G(12, ["p-nyambura-l", "p-simiyu-e", "p-adhiambo-p"]),
];

/* ------------------------------------------------------------------ */
/* Demo user profile                                                   */
/* ------------------------------------------------------------------ */

export const USER_HISTORY: HistoryEntry[] = [
  { tournament: "Muthaiga July Monthly Medal", club: "Muthaiga", date: "2026-07-05", position: 12, fieldSize: 72, score: "net 73" },
  { tournament: "Karen Club Championship Qualifying", club: "Karen", date: "2026-06-27", position: 8, fieldSize: 84, score: "net 70" },
  { tournament: "Sigona Invitational", club: "Sigona", date: "2026-06-14", position: 21, fieldSize: 66, score: "33 pts" },
  { tournament: "Muthaiga June Monthly Medal", club: "Muthaiga", date: "2026-06-07", position: 5, fieldSize: 68, score: "net 69" },
  { tournament: "KGU Order of Merit Round 2", club: "Vet Lab", date: "2026-05-24", position: 34, fieldSize: 102, score: "gross 84" },
  { tournament: "Windsor May Open", club: "Windsor", date: "2026-05-09", position: 15, fieldSize: 74, score: "35 pts" },
  { tournament: "Muthaiga Easter Trophy", club: "Muthaiga", date: "2026-04-11", position: 3, fieldSize: 80, score: "39 pts" },
  { tournament: "Royal Nairobi Centenary Cup", club: "Royal Nairobi", date: "2026-03-21", position: 19, fieldSize: 90, score: "net 75" },
];

/** Handicap index by month, oldest → newest (Aug 2025 → Jul 2026). */
export const USER_HI_TREND = [
  { month: "Aug", hi: 13.8 },
  { month: "Sep", hi: 13.5 },
  { month: "Oct", hi: 13.6 },
  { month: "Nov", hi: 13.1 },
  { month: "Dec", hi: 12.9 },
  { month: "Jan", hi: 13.0 },
  { month: "Feb", hi: 12.6 },
  { month: "Mar", hi: 12.4 },
  { month: "Apr", hi: 12.5 },
  { month: "May", hi: 12.2 },
  { month: "Jun", hi: 12.1 },
  { month: "Jul", hi: 11.9 },
];
