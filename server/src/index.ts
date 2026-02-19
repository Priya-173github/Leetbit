import cors from "cors";
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { all, get, initDb, run } from "./db.js";

interface HabitRow {
  id: number;
  name: string;
  created_at: string;
  deleted_on?: string | null;
}

interface CheckinRow {
  date: string;
  completed: number;
}

interface PeriodSummary {
  completed: number;
  total: number;
  consistency: number;
}

interface HabitComparisonItem {
  habitId: number;
  name: string;
  consistency: number;
}

interface HabitDateRow {
  habit_id: number;
  date: string;
  completed: number;
}

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
}

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function fromISODate(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function addDaysUTC(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function startOfISOWeek(date: Date) {
  const day = date.getUTCDay();
  const diff = (day + 6) % 7;
  return addDaysUTC(date, -diff);
}

function endOfISOWeek(date: Date) {
  return addDaysUTC(startOfISOWeek(date), 6);
}

function endOfMonthUTC(year: number, monthZeroBased: number) {
  return new Date(Date.UTC(year, monthZeroBased + 1, 0));
}

function monthLabel(year: number, monthZeroBased: number) {
  return new Date(Date.UTC(year, monthZeroBased, 1)).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  });
}

function dayBeforeISO(dateISO: string) {
  return toISODate(addDaysUTC(fromISODate(dateISO), -1));
}

function isHabitActiveOnDate(habit: HabitRow, dateISO: string) {
  return habit.created_at <= dateISO && (!habit.deleted_on || habit.deleted_on > dateISO);
}

async function buildPeriodSummary(
  habitId: number,
  start: Date,
  end: Date,
  today: Date
): Promise<PeriodSummary> {
  const cappedEnd = end > today ? today : end;
  if (cappedEnd < start) {
    return { completed: 0, total: 0, consistency: 0 };
  }

  const rows = await all<CheckinRow>(
    "SELECT date, completed FROM checkins WHERE habit_id = ? AND date BETWEEN ? AND ?",
    [habitId, toISODate(start), toISODate(cappedEnd)]
  );

  const completedMap = new Map(rows.map((row) => [row.date, row.completed === 1]));
  let completed = 0;
  let total = 0;

  for (let d = new Date(start); d <= cappedEnd; d = addDaysUTC(d, 1)) {
    total += 1;
    if (completedMap.get(toISODate(d))) {
      completed += 1;
    }
  }

  return {
    completed,
    total,
    consistency: total === 0 ? 0 : Number(((completed / total) * 100).toFixed(1))
  };
}

async function buildAllPeriodSummary(
  habits: HabitRow[],
  checkinsMap: Map<string, number>,
  start: Date,
  end: Date,
  today: Date
): Promise<PeriodSummary> {
  const cappedEnd = end > today ? today : end;
  if (cappedEnd < start) {
    return { completed: 0, total: 0, consistency: 0 };
  }
  let completed = 0;
  let total = 0;
  for (let d = new Date(start); d <= cappedEnd; d = addDaysUTC(d, 1)) {
    const iso = toISODate(d);
    const activeHabits = habits.filter((habit) => isHabitActiveOnDate(habit, iso));
    if (activeHabits.length === 0) continue;
    for (const habit of activeHabits) {
      total += 1;
      if ((checkinsMap.get(`${habit.id}-${iso}`) ?? 0) === 1) {
        completed += 1;
      }
    }
  }
  return {
    completed,
    total,
    consistency: total === 0 ? 0 : Number(((completed / total) * 100).toFixed(1))
  };
}

async function getHabitCompletionsMap(habitId: number) {
  const rows = await all<CheckinRow>(
    "SELECT date, completed FROM checkins WHERE habit_id = ?",
    [habitId]
  );
  return new Map(rows.map((row) => [row.date, row.completed === 1]));
}

function computeStreaksFromMap(
  completionsMap: Map<string, boolean>,
  startDate: Date,
  today: Date
) {
  let currentStreak = 0;
  for (let d = new Date(today); d >= startDate; d = addDaysUTC(d, -1)) {
    if (completionsMap.get(toISODate(d))) {
      currentStreak += 1;
    } else {
      break;
    }
  }

  let longestStreak = 0;
  let running = 0;
  for (let d = new Date(startDate); d <= today; d = addDaysUTC(d, 1)) {
    if (completionsMap.get(toISODate(d))) {
      running += 1;
      if (running > longestStreak) longestStreak = running;
    } else {
      running = 0;
    }
  }

  return { currentStreak, longestStreak };
}

const app = express();
const port = 4000;
const JWT_SECRET = process.env.JWT_SECRET || "leetbit-dev-secret";

app.use(cors({
  origin: process.env.FRONTEND_URL
}));
app.use(express.json());

type AuthTokenPayload = jwt.JwtPayload & {
  sub: string | number;
  username: string;
};

function isAuthTokenPayload(value: string | jwt.JwtPayload): value is AuthTokenPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "sub" in value &&
    "username" in value &&
    typeof (value as { username?: unknown }).username === "string"
  );
}


function createAuthToken(user: { id: number; username: string }) {
  return jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
}

app.post("/api/auth/register", async (req, res) => {
  const username = String(req.body?.username ?? "").trim();
  const password = String(req.body?.password ?? "").trim();
  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
    res.status(400).json({ message: "Username must be 3-24 chars (letters, numbers, underscore)." });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ message: "Password must be at least 6 characters." });
    return;
  }

  const existing = await get<UserRow>("SELECT id FROM users WHERE lower(username) = lower(?)", [username]);
  if (existing) {
    res.status(409).json({ message: "Username already exists." });
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  const result = await run(
    "INSERT INTO users (username, password_hash) VALUES (?, ?) RETURNING id",
    [username, hash]
  );
  const user = await get<UserRow>("SELECT id, username FROM users WHERE id = ?", [result.lastID]);
  if (!user) {
    res.status(500).json({ message: "Unable to create user." });
    return;
  }

  const token = createAuthToken({ id: user.id, username: user.username });
  res.status(201).json({ token, user: { id: user.id, username: user.username } });
});

app.post("/api/auth/login", async (req, res) => {
  const username = String(req.body?.username ?? "").trim();
  const password = String(req.body?.password ?? "").trim();
  if (!username || !password) {
    res.status(400).json({ message: "Username and password are required." });
    return;
  }

  const user = await get<UserRow>("SELECT id, username, password_hash FROM users WHERE lower(username) = lower(?)", [username]);
  if (!user) {
    res.status(401).json({ message: "Invalid credentials." });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ message: "Invalid credentials." });
    return;
  }

  const token = createAuthToken({ id: user.id, username: user.username });
  res.json({ token, user: { id: user.id, username: user.username } });
});

app.use("/api", (req, res, next) => {
  if (req.path === "/health" || req.path === "/auth/register" || req.path === "/auth/login") {
    next();
    return;
  }

  const authHeader = String(req.headers.authorization ?? "");
  if (!authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized." });
    return;
  }

  try {
    const token = authHeader.slice("Bearer ".length);
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!isAuthTokenPayload(decoded)) {
      res.status(401).json({ message: "Invalid token payload." });
      return;
    }

    (req as express.Request & { user?: { id: number; username: string } }).user = {
      id: Number(decoded.sub),
      username: decoded.username
    };
    next();
  } catch {
    res.status(401).json({ message: "Invalid token." });
  }
});

app.get("/api/auth/me", (req, res) => {
  const user = (req as express.Request & { user?: { id: number; username: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized." });
    return;
  }
  res.json({ user });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/habits", async (_req, res) => {
  const habits = await all<HabitRow>(
    "SELECT id, name, created_at FROM habits WHERE deleted_on IS NULL ORDER BY id ASC"
  );
  res.json(
    habits.map((habit) => ({
      id: habit.id,
      name: habit.name,
      createdAt: habit.created_at
    }))
  );
});

app.get("/api/checkins", async (req, res) => {
  const year = Number(req.query.year ?? new Date().getFullYear());
  const startQuery = typeof req.query.start === "string" ? req.query.start : "";
  const endQuery = typeof req.query.end === "string" ? req.query.end : "";

  const hasRange = Boolean(startQuery || endQuery);
  let start = `${year}-01-01`;
  let end = `${year}-12-31`;

  if (hasRange) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startQuery) || !/^\d{4}-\d{2}-\d{2}$/.test(endQuery)) {
      res.status(400).json({ message: "start and end must be YYYY-MM-DD." });
      return;
    }
    start = startQuery;
    end = endQuery;
  } else if (!Number.isInteger(year) || year < 1970 || year > 2100) {
    res.status(400).json({ message: "Invalid year." });
    return;
  }

  const data = await all<{ date: string; completed: number }>(
    `SELECT c.date, SUM(c.completed) AS completed
     FROM checkins c
     JOIN habits h ON h.id = c.habit_id
     WHERE c.date BETWEEN ? AND ?
       AND h.created_at <= c.date
       AND (h.deleted_on IS NULL OR h.deleted_on > c.date)
     GROUP BY c.date
     ORDER BY c.date ASC`,
    [start, end]
  );
  res.json(data);
});

app.get("/api/years", async (_req, res) => {
  const rows = await all<{ year: string }>(
    `SELECT DISTINCT substr(c.date, 1, 4) AS year
     FROM checkins c
     JOIN habits h ON h.id = c.habit_id
     WHERE h.created_at <= c.date
       AND (h.deleted_on IS NULL OR h.deleted_on > c.date)
     ORDER BY year DESC`
  );
  res.json(rows.map((row) => Number(row.year)).filter((year) => Number.isInteger(year)));
});

app.get("/api/summary", async (req, res) => {
  const year = Number(req.query.year ?? new Date().getUTCFullYear());
  if (!Number.isInteger(year) || year < 1970 || year > 2100) {
    res.status(400).json({ message: "Invalid year." });
    return;
  }

  const habits = await all<HabitRow>("SELECT id, name, created_at, deleted_on FROM habits ORDER BY id ASC");
  if (habits.length === 0) {
    res.json({
      year: { completed: 0, total: 0, consistency: 0 },
      currentWeek: { completed: 0, total: 0, consistency: 0 },
      currentMonth: { completed: 0, total: 0, consistency: 0 },
      weekly: [],
      monthly: [],
      currentStreak: 0,
      longestStreak: 0,
      lifetimeCompletions: 0,
      bestDay: "N/A",
      missedDayInsight: "No habit data yet.",
      habitComparison: []
    });
    return;
  }

  const nowISO = toISODate(new Date());
  const today = fromISODate(nowISO);
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31));
  const currentWeekStart = startOfISOWeek(today);
  const currentWeekEnd = endOfISOWeek(today);
  const currentMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const currentMonthEnd = endOfMonthUTC(today.getUTCFullYear(), today.getUTCMonth());

  const checkins = await all<HabitDateRow>(
    `SELECT habit_id, date, completed
     FROM checkins
     WHERE date <= ?`,
    [toISODate(today)]
  );
  const checkinsMap = new Map(checkins.map((row) => [`${row.habit_id}-${row.date}`, row.completed]));

  const [yearSummary, weekSummary, monthSummary] = await Promise.all([
    buildAllPeriodSummary(habits, checkinsMap, yearStart, yearEnd, today),
    buildAllPeriodSummary(habits, checkinsMap, currentWeekStart, currentWeekEnd, today),
    buildAllPeriodSummary(habits, checkinsMap, currentMonthStart, currentMonthEnd, today)
  ]);

  const weekly: Array<{ label: string; completed: number; total: number; consistency: number }> = [];
  for (let i = 7; i >= 0; i -= 1) {
    const start = addDaysUTC(currentWeekStart, -i * 7);
    const end = addDaysUTC(start, 6);
    const summary = await buildAllPeriodSummary(habits, checkinsMap, start, end, today);
    weekly.push({ label: `${toISODate(start)} to ${toISODate(end)}`, ...summary });
  }

  const monthly: Array<{ label: string; completed: number; total: number; consistency: number }> = [];
  for (let month = 0; month < 12; month += 1) {
    const start = new Date(Date.UTC(year, month, 1));
    const end = endOfMonthUTC(year, month);
    const summary = await buildAllPeriodSummary(habits, checkinsMap, start, end, today);
    monthly.push({ label: monthLabel(year, month), ...summary });
  }

  let currentStreak = 0;
  for (let d = new Date(today); ; d = addDaysUTC(d, -1)) {
    const iso = toISODate(d);
    const activeHabits = habits.filter((habit) => isHabitActiveOnDate(habit, iso));
    if (activeHabits.length === 0) break;
    const doneCount = activeHabits.reduce(
      (sum, habit) => sum + ((checkinsMap.get(`${habit.id}-${iso}`) ?? 0) === 1 ? 1 : 0),
      0
    );
    if (doneCount === activeHabits.length) currentStreak += 1;
    else break;
  }

  let longestStreak = 0;
  let run = 0;
  const earliestCreated = habits
    .map((h) => h.created_at)
    .sort()[0];
  for (let d = fromISODate(earliestCreated); d <= today; d = addDaysUTC(d, 1)) {
    const iso = toISODate(d);
    const activeHabits = habits.filter((habit) => isHabitActiveOnDate(habit, iso));
    if (activeHabits.length === 0) continue;
    const doneCount = activeHabits.reduce(
      (sum, habit) => sum + ((checkinsMap.get(`${habit.id}-${iso}`) ?? 0) === 1 ? 1 : 0),
      0
    );
    if (doneCount === activeHabits.length) {
      run += 1;
      if (run > longestStreak) longestStreak = run;
    } else {
      run = 0;
    }
  }

  const lifetimeCompletions = checkins.reduce((sum, row) => {
    const habit = habits.find((h) => h.id === row.habit_id);
    if (!habit) return sum;
    if (!isHabitActiveOnDate(habit, row.date)) return sum;
    return sum + (row.completed === 1 ? 1 : 0);
  }, 0);

  const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekdayStats = weekdayNames.map((name) => ({ name, done: 0, total: 0, rate: 0 }));
  for (let d = new Date(yearStart); d <= (yearEnd < today ? yearEnd : today); d = addDaysUTC(d, 1)) {
    const iso = toISODate(d);
    const weekday = d.getUTCDay();
    const activeHabits = habits.filter((habit) => isHabitActiveOnDate(habit, iso));
    if (activeHabits.length === 0) continue;
    for (const habit of activeHabits) {
      weekdayStats[weekday].total += 1;
      if ((checkinsMap.get(`${habit.id}-${iso}`) ?? 0) === 1) weekdayStats[weekday].done += 1;
    }
  }
  weekdayStats.forEach((s) => {
    s.rate = s.total === 0 ? 0 : Number(((s.done / s.total) * 100).toFixed(1));
  });
  const bestDay = [...weekdayStats].sort((a, b) => b.rate - a.rate)[0]?.name ?? "N/A";
  const missedDay = [...weekdayStats].sort((a, b) => a.rate - b.rate)[0]?.name ?? "N/A";

  const habitComparison: HabitComparisonItem[] = [];
  for (const habit of habits) {
    const start = yearStart > fromISODate(habit.created_at) ? yearStart : fromISODate(habit.created_at);
    const summary = await buildPeriodSummary(habit.id, start, yearEnd, today);
    habitComparison.push({ habitId: habit.id, name: habit.name, consistency: summary.consistency });
  }

  res.json({
    year: yearSummary,
    currentWeek: weekSummary,
    currentMonth: monthSummary,
    weekly,
    monthly,
    currentStreak,
    longestStreak,
    lifetimeCompletions,
    bestDay,
    missedDayInsight: `You miss your habits most on ${missedDay}.`,
    habitComparison
  });
});

app.post("/api/habits", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) {
    res.status(400).json({ message: "Habit name is required." });
    return;
  }

  const existingActive = await get<HabitRow>(
    "SELECT id FROM habits WHERE lower(name) = lower(?) AND deleted_on IS NULL",
    [name]
  );
  if (existingActive) {
    res.status(409).json({ message: "Habit already exists." });
    return;
  }

  const existingDeleted = await get<HabitRow>(
    "SELECT id FROM habits WHERE lower(name) = lower(?) AND deleted_on IS NOT NULL ORDER BY deleted_on DESC LIMIT 1",
    [name]
  );
  if (existingDeleted) {
    const today = toISODate(new Date());
    await run(
      "UPDATE habits SET deleted_on = NULL, created_at = ? WHERE id = ?",
      [today, existingDeleted.id]
    );
    const restored = await get<HabitRow>(
      "SELECT id, name, created_at FROM habits WHERE id = ?",
      [existingDeleted.id]
    );
    res.status(201).json({
      id: restored?.id,
      name: restored?.name,
      createdAt: restored?.created_at
    });
    return;
  }

  try {
    const result = await run("INSERT INTO habits (name) VALUES (?) RETURNING id", [name]);
    const habit = await get<HabitRow>(
      "SELECT id, name, created_at FROM habits WHERE id = ?",
      [result.lastID]
    );
    res.status(201).json({
      id: habit?.id,
      name: habit?.name,
      createdAt: habit?.created_at
    });
  } catch {
    res.status(409).json({ message: "Habit already exists." });
  }
});

app.delete("/api/habits/:habitId", async (req, res) => {
  const habitId = Number(req.params.habitId);
  if (!Number.isInteger(habitId) || habitId <= 0) {
    res.status(400).json({ message: "Invalid habit id." });
    return;
  }

  const habit = await get<HabitRow>("SELECT id, deleted_on FROM habits WHERE id = ?", [habitId]);
  if (!habit) {
    res.status(404).json({ message: "Habit not found." });
    return;
  }
  if (habit.deleted_on) {
    res.json({ success: true });
    return;
  }

  const today = toISODate(new Date());
  await run("UPDATE habits SET deleted_on = ? WHERE id = ?", [today, habitId]);
  res.json({ success: true });
});

app.get("/api/habits/:habitId/checkins", async (req, res) => {
  const habitId = Number(req.params.habitId);
  const year = Number(req.query.year ?? new Date().getFullYear());
  const startQuery = typeof req.query.start === "string" ? req.query.start : "";
  const endQuery = typeof req.query.end === "string" ? req.query.end : "";

  if (!Number.isInteger(habitId) || habitId <= 0) {
    res.status(400).json({ message: "Invalid habit id." });
    return;
  }

  const hasRange = Boolean(startQuery || endQuery);
  let start = `${year}-01-01`;
  let end = `${year}-12-31`;

  if (hasRange) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startQuery) || !/^\d{4}-\d{2}-\d{2}$/.test(endQuery)) {
      res.status(400).json({ message: "start and end must be YYYY-MM-DD." });
      return;
    }
    start = startQuery;
    end = endQuery;
  } else if (!Number.isInteger(year) || year < 1970 || year > 2100) {
    res.status(400).json({ message: "Invalid year." });
    return;
  }

  const habit = await get<HabitRow>(
    "SELECT id, created_at, deleted_on FROM habits WHERE id = ?",
    [habitId]
  );
  if (!habit) {
    res.status(404).json({ message: "Habit not found." });
    return;
  }

  const boundedStart = start < habit.created_at ? habit.created_at : start;
  const deletedUntil = habit.deleted_on ? dayBeforeISO(habit.deleted_on) : null;
  const boundedEnd = deletedUntil && deletedUntil < end ? deletedUntil : end;
  if (boundedEnd < boundedStart) {
    res.json([]);
    return;
  }

  const data = await all<CheckinRow>(
    "SELECT date, completed FROM checkins WHERE habit_id = ? AND date BETWEEN ? AND ?",
    [habitId, boundedStart, boundedEnd]
  );
  res.json(data);
});

app.get("/api/habits/:habitId/years", async (req, res) => {
  const habitId = Number(req.params.habitId);

  if (!Number.isInteger(habitId) || habitId <= 0) {
    res.status(400).json({ message: "Invalid habit id." });
    return;
  }

  const habit = await get<HabitRow>("SELECT id FROM habits WHERE id = ?", [habitId]);
  if (!habit) {
    res.status(404).json({ message: "Habit not found." });
    return;
  }

  const rows = await all<{ year: string }>(
    `SELECT DISTINCT substr(date, 1, 4) AS year
     FROM checkins
     WHERE habit_id = ?
       AND date >= (SELECT created_at FROM habits WHERE id = ?)
       AND (
         (SELECT deleted_on FROM habits WHERE id = ?) IS NULL
         OR date < (SELECT deleted_on FROM habits WHERE id = ?)
       )
     ORDER BY year DESC`,
    [habitId, habitId, habitId, habitId]
  );

  res.json(rows.map((row) => Number(row.year)).filter((year) => Number.isInteger(year)));
});

app.get("/api/streak", async (_req, res) => {
  const today = toISODate(new Date());
  const allHabits = await all<HabitRow>("SELECT id, created_at, deleted_on, name FROM habits");
  if (allHabits.length === 0) {
    res.json({ streak: 0, date: today });
    return;
  }

  const rows = await all<{ habit_id: number; date: string; completed: number }>(
    `SELECT habit_id, date, completed
     FROM checkins
     WHERE date <= ?`,
    [today]
  );
  const checkinMap = new Map(rows.map((row) => [`${row.habit_id}-${row.date}`, row.completed]));
  let streak = 0;

  for (let d = fromISODate(today); ; d = addDaysUTC(d, -1)) {
    const iso = toISODate(d);
    const activeHabits = allHabits.filter(
      (habit) =>
        habit.created_at <= iso && (!habit.deleted_on || habit.deleted_on > iso)
    );
    if (activeHabits.length === 0) {
      break;
    }
    const doneCount = activeHabits.reduce(
      (sum, habit) => sum + ((checkinMap.get(`${habit.id}-${iso}`) ?? 0) === 1 ? 1 : 0),
      0
    );
    if (doneCount === activeHabits.length) {
      streak += 1;
      continue;
    }
    break;
  }

  res.json({ streak, date: today });
});

app.get("/api/habits/:habitId/summary", async (req, res) => {
  const habitId = Number(req.params.habitId);
  const year = Number(req.query.year ?? new Date().getUTCFullYear());

  if (!Number.isInteger(habitId) || habitId <= 0) {
    res.status(400).json({ message: "Invalid habit id." });
    return;
  }

  if (!Number.isInteger(year) || year < 1970 || year > 2100) {
    res.status(400).json({ message: "Invalid year." });
    return;
  }

  const habit = await get<HabitRow>("SELECT id, created_at, deleted_on FROM habits WHERE id = ?", [habitId]);
  if (!habit) {
    res.status(404).json({ message: "Habit not found." });
    return;
  }
  const allHabits = await all<HabitRow>("SELECT id, name, created_at FROM habits ORDER BY id ASC");

  const now = toISODate(new Date());
  const effectiveTodayISO =
    habit.deleted_on && habit.deleted_on <= now ? dayBeforeISO(habit.deleted_on) : now;
  const today = fromISODate(effectiveTodayISO);
  const createdAt = fromISODate(habit.created_at);
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31));
  const effectiveYearStart = yearStart > createdAt ? yearStart : createdAt;
  const currentWeekStart = startOfISOWeek(today);
  const currentWeekEnd = endOfISOWeek(today);
  const currentMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const currentMonthEnd = endOfMonthUTC(today.getUTCFullYear(), today.getUTCMonth());

  const [yearSummary, weekSummary, monthSummary] = await Promise.all([
    buildPeriodSummary(habitId, effectiveYearStart, yearEnd, today),
    buildPeriodSummary(habitId, currentWeekStart, currentWeekEnd, today),
    buildPeriodSummary(habitId, currentMonthStart, currentMonthEnd, today)
  ]);

  const weekly: Array<{ label: string; completed: number; total: number; consistency: number }> =
    [];
  for (let i = 7; i >= 0; i -= 1) {
    const start = addDaysUTC(currentWeekStart, -i * 7);
    const end = addDaysUTC(start, 6);
    const summary = await buildPeriodSummary(habitId, start, end, today);
    weekly.push({
      label: `${toISODate(start)} to ${toISODate(end)}`,
      ...summary
    });
  }

  const monthly: Array<{
    label: string;
    completed: number;
    total: number;
    consistency: number;
  }> = [];

  for (let month = 0; month < 12; month += 1) {
    const start = new Date(Date.UTC(year, month, 1));
    const end = endOfMonthUTC(year, month);
    const effectiveStart = start > createdAt ? start : createdAt;
    const summary = await buildPeriodSummary(habitId, effectiveStart, end, today);
    monthly.push({
      label: monthLabel(year, month),
      ...(effectiveStart > end ? { completed: 0, total: 0, consistency: 0 } : summary)
    });
  }

  const completionsMap = await getHabitCompletionsMap(habitId);
  const { currentStreak, longestStreak } = computeStreaksFromMap(completionsMap, createdAt, today);

  const lifetimeCompletionsRow = await get<{ completed: number }>(
    "SELECT COALESCE(SUM(completed), 0) AS completed FROM checkins WHERE habit_id = ?",
    [habitId]
  );
  const lifetimeCompletions = lifetimeCompletionsRow?.completed ?? 0;

  const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekdayStats = weekdayNames.map((name) => ({ name, done: 0, total: 0, rate: 0 }));
  for (let d = new Date(yearStart); d <= (yearEnd < today ? yearEnd : today); d = addDaysUTC(d, 1)) {
    const weekday = d.getUTCDay();
    weekdayStats[weekday].total += 1;
    if (completionsMap.get(toISODate(d))) {
      weekdayStats[weekday].done += 1;
    }
  }
  weekdayStats.forEach((s) => {
    s.rate = s.total === 0 ? 0 : Number(((s.done / s.total) * 100).toFixed(1));
  });
  const bestDay = [...weekdayStats].sort((a, b) => b.rate - a.rate)[0]?.name ?? "N/A";
  const missedDay = [...weekdayStats].sort((a, b) => a.rate - b.rate)[0]?.name ?? "N/A";
  const missedDayInsight = `You miss this habit most on ${missedDay}.`;

  const habitComparison: HabitComparisonItem[] = [];
  for (const entry of allHabits) {
    const rowCreatedAt = fromISODate(entry.created_at);
    const start = yearStart > rowCreatedAt ? yearStart : rowCreatedAt;
    const comparisonSummary = await buildPeriodSummary(entry.id, start, yearEnd, today);
    habitComparison.push({
      habitId: entry.id,
      name: entry.name,
      consistency: comparisonSummary.consistency
    });
  }

  res.json({
    year: yearSummary,
    currentWeek: weekSummary,
    currentMonth: monthSummary,
    weekly,
    monthly,
    currentStreak,
    longestStreak,
    lifetimeCompletions,
    bestDay,
    missedDayInsight,
    habitComparison
  });
});

app.get("/api/checklist", async (req, res) => {
  const date = String(req.query.date ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ message: "date query must be YYYY-MM-DD." });
    return;
  }

  const rows = await all<{
    habitId: number;
    name: string;
    completed: number | null;
  }>(
    `SELECT h.id AS habitId, h.name, c.completed
     FROM habits h
     LEFT JOIN checkins c
       ON h.id = c.habit_id AND c.date = ?
     WHERE h.created_at <= ?
       AND (h.deleted_on IS NULL OR h.deleted_on > ?)
     ORDER BY h.id ASC`,
    [date, date, date]
  );

  res.json(rows.map((row) => ({ ...row, completed: Boolean(row.completed) })));
});

app.put("/api/checklist/:habitId", async (req, res) => {
  const habitId = Number(req.params.habitId);
  const date = String(req.body?.date ?? "").trim();
  const completed = Boolean(req.body?.completed);
  const today = toISODate(new Date());

  if (!Number.isInteger(habitId) || habitId <= 0) {
    res.status(400).json({ message: "Invalid habit id." });
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ message: "date must be YYYY-MM-DD." });
    return;
  }

  if (date !== today) {
    res.status(400).json({ message: "You can only update checklist for today's date." });
    return;
  }

  const habit = await get<HabitRow>(
    "SELECT id FROM habits WHERE id = ? AND created_at <= ? AND (deleted_on IS NULL OR deleted_on > ?)",
    [habitId, date, date]
  );
  if (!habit) {
    res.status(404).json({ message: "Habit not found." });
    return;
  }

  await run(
    `INSERT INTO checkins (habit_id, date, completed)
     VALUES (?, ?, ?)
     ON CONFLICT(habit_id, date)
     DO UPDATE SET completed = excluded.completed`,
    [habitId, date, completed ? 1 : 0]
  );

  res.json({ success: true });
});

async function start() {
  await initDb();
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running at http://localhost:${port}`);
  });
}

void start();
