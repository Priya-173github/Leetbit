const API_BASE = "http://localhost:4000/api";
let authToken: string | null = null;

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
  currentStreak: number;
  longestStreak: number;
  lifetimeCompletions: number;
  bestDay: string;
  missedDayInsight: string;
  habitComparison: Array<{
    habitId: number;
    name: string;
    consistency: number;
  }>;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
  };
  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    ...init
  });

  if (!res.ok) {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text) as { message?: string };
      throw new Error(parsed.message || "API request failed");
    } catch {
      throw new Error(text || "API request failed");
    }
  }

  return res.json() as Promise<T>;
}

export function listHabits() {
  return request<Habit[]>("/habits");
}

export function setAuthToken(token: string | null) {
  authToken = token;
}

export interface AuthUser {
  id: number;
  username: string;
}

export function register(username: string, password: string) {
  return request<{ token: string; user: AuthUser }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

export function login(username: string, password: string) {
  return request<{ token: string; user: AuthUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

export function me() {
  return request<{ user: AuthUser }>("/auth/me");
}

export function createHabit(name: string) {
  return request<Habit>("/habits", {
    method: "POST",
    body: JSON.stringify({ name })
  });
}

export function deleteHabit(habitId: number) {
  return request<{ success: true }>(`/habits/${habitId}`, {
    method: "DELETE"
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

export function getAllHeatmap(options: { year?: number; start?: string; end?: string }) {
  const params = new URLSearchParams();
  if (options.start && options.end) {
    params.set("start", options.start);
    params.set("end", options.end);
  } else if (options.year) {
    params.set("year", String(options.year));
  }
  const query = params.toString();
  return request<CheckinPoint[]>(`/checkins${query ? `?${query}` : ""}`);
}

export function getHabitSummary(habitId: number, year: number) {
  return request<HabitSummary>(`/habits/${habitId}/summary?year=${year}`);
}

export function getAllSummary(year: number) {
  return request<HabitSummary>(`/summary?year=${year}`);
}

export function getHabitYears(habitId: number) {
  return request<number[]>(`/habits/${habitId}/years`);
}

export function getAllYears() {
  return request<number[]>("/years");
}

export function getStreak() {
  return request<{ streak: number; date: string }>("/streak");
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
