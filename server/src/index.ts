import cors from "cors";
import express from "express";
import { all, get, initDb, run } from "./db.js";

interface HabitRow {
  id: number;
  name: string;
  created_at: string;
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

const app = express();
const port = 4000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/habits", async (_req, res) => {
  const habits = await all<HabitRow>(
    "SELECT id, name, created_at FROM habits ORDER BY id ASC"
  );
  res.json(
    habits.map((habit) => ({
      id: habit.id,
      name: habit.name,
      createdAt: habit.created_at
    }))
  );
});

app.post("/api/habits", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) {
    res.status(400).json({ message: "Habit name is required." });
    return;
  }

  try {
    const result = await run("INSERT INTO habits (name) VALUES (?)", [name]);
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

app.get("/api/habits/:habitId/checkins", async (req, res) => {
  const habitId = Number(req.params.habitId);
  const year = Number(req.query.year ?? new Date().getFullYear());

  if (!Number.isInteger(habitId) || habitId <= 0) {
    res.status(400).json({ message: "Invalid habit id." });
    return;
  }

  if (!Number.isInteger(year) || year < 1970 || year > 2100) {
    res.status(400).json({ message: "Invalid year." });
    return;
  }

  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const data = await all<CheckinRow>(
    "SELECT date, completed FROM checkins WHERE habit_id = ? AND date BETWEEN ? AND ?",
    [habitId, start, end]
  );
  res.json(data);
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

  const habit = await get<HabitRow>("SELECT id FROM habits WHERE id = ?", [habitId]);
  if (!habit) {
    res.status(404).json({ message: "Habit not found." });
    return;
  }

  const today = fromISODate(toISODate(new Date()));
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31));
  const currentWeekStart = startOfISOWeek(today);
  const currentWeekEnd = endOfISOWeek(today);
  const currentMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const currentMonthEnd = endOfMonthUTC(today.getUTCFullYear(), today.getUTCMonth());

  const [yearSummary, weekSummary, monthSummary] = await Promise.all([
    buildPeriodSummary(habitId, yearStart, yearEnd, today),
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
    const summary = await buildPeriodSummary(habitId, start, end, today);
    monthly.push({
      label: monthLabel(year, month),
      ...summary
    });
  }

  res.json({
    year: yearSummary,
    currentWeek: weekSummary,
    currentMonth: monthSummary,
    weekly,
    monthly
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
     ORDER BY h.id ASC`,
    [date]
  );

  res.json(rows.map((row) => ({ ...row, completed: Boolean(row.completed) })));
});

app.put("/api/checklist/:habitId", async (req, res) => {
  const habitId = Number(req.params.habitId);
  const date = String(req.body?.date ?? "").trim();
  const completed = Boolean(req.body?.completed);

  if (!Number.isInteger(habitId) || habitId <= 0) {
    res.status(400).json({ message: "Invalid habit id." });
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ message: "date must be YYYY-MM-DD." });
    return;
  }

  const habit = await get<HabitRow>("SELECT id FROM habits WHERE id = ?", [habitId]);
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
