const API_BASE = "http://localhost:4000/api";

export interface Habit {
  id: number;
  name: string;
  createdAt: string;
}

export interface CheckinPoint {
  date: string;
  completed: number;
}

export interface DayChecklistItem {
  habitId: number;
  name: string;
  completed: boolean;
}

export interface PeriodSummary {
  completed: number;
  total: number;
  consistency: number;
}

export interface HabitSummary {
  year: PeriodSummary;
  currentWeek: PeriodSummary;
  currentMonth: PeriodSummary;
  weekly: Array<PeriodSummary & { label: string }>;
  monthly: Array<PeriodSummary & { label: string }>;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(errorBody || "API request failed");
  }

  return res.json() as Promise<T>;
}

export function listHabits() {
  return request<Habit[]>("/habits");
}

export function createHabit(name: string) {
  return request<Habit>("/habits", {
    method: "POST",
    body: JSON.stringify({ name })
  });
}

export function getHabitHeatmap(habitId: number, options: { year?: number; start?: string; end?: string }) {
  const params = new URLSearchParams();
  if (options.start && options.end) {
    params.set("start", options.start);
    params.set("end", options.end);
  } else if (options.year) {
    params.set("year", String(options.year));
  }
  const query = params.toString();
  return request<CheckinPoint[]>(`/habits/${habitId}/checkins${query ? `?${query}` : ""}`);
}

export function getHabitSummary(habitId: number, year: number) {
  return request<HabitSummary>(`/habits/${habitId}/summary?year=${year}`);
}

export function getDayChecklist(date: string) {
  return request<DayChecklistItem[]>(`/checklist?date=${date}`);
}

export function updateChecklistItem(habitId: number, date: string, completed: boolean) {
  return request<{ success: true }>(`/checklist/${habitId}`, {
    method: "PUT",
    body: JSON.stringify({ date, completed })
  });
}
