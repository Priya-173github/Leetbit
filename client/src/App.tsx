import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  createHabit,
  getDayChecklist,
  getHabitHeatmap,
  getHabitSummary,
  listHabits,
  updateChecklistItem,
  type CheckinPoint,
  type DayChecklistItem,
  type Habit,
  type HabitSummary
} from "./api";
import { HeatmapChart } from "./components/HeatmapChart";

const todayISO = new Date().toISOString().slice(0, 10);
const currentYear = new Date().getFullYear();
type Tab = "dashboard" | "analytics";

export function App() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [selectedHabitId, setSelectedHabitId] = useState<number | null>(null);
  const [heatmapData, setHeatmapData] = useState<CheckinPoint[]>([]);
  const [summary, setSummary] = useState<HabitSummary | null>(null);
  const [checklist, setChecklist] = useState<DayChecklistItem[]>([]);
  const [date, setDate] = useState(todayISO);
  const [newHabitName, setNewHabitName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  const selectedHabit = useMemo(
    () => habits.find((habit) => habit.id === selectedHabitId) ?? null,
    [habits, selectedHabitId]
  );

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!selectedHabitId) return;
    void refreshHabitStats(selectedHabitId);
  }, [selectedHabitId]);

  useEffect(() => {
    if (habits.length === 0) return;
    void refreshChecklist(date);
  }, [date, habits.length]);

  async function bootstrap() {
    try {
      setLoading(true);
      const data = await listHabits();
      setHabits(data);
      if (data.length > 0) {
        setSelectedHabitId(data[0].id);
      }
      if (data.length > 0) {
        const [daily] = await Promise.all([getDayChecklist(date)]);
        setChecklist(daily);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshHabitStats(habitId: number) {
    try {
      setError(null);
      const [heatmap, summaryData] = await Promise.all([
        getHabitHeatmap(habitId, currentYear),
        getHabitSummary(habitId, currentYear)
      ]);
      setHeatmapData(heatmap);
      setSummary(summaryData);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function refreshChecklist(targetDate: string) {
    try {
      setError(null);
      const data = await getDayChecklist(targetDate);
      setChecklist(data);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleCreateHabit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newHabitName.trim();
    if (!name) return;

    try {
      setError(null);
      const created = await createHabit(name);
      const nextHabits = [...habits, created];
      setHabits(nextHabits);
      setNewHabitName("");
      if (!selectedHabitId) {
        setSelectedHabitId(created.id);
      }
      await refreshChecklist(date);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function toggleHabit(item: DayChecklistItem, checked: boolean) {
    try {
      setError(null);
      await updateChecklistItem(item.habitId, date, checked);
      setChecklist((prev) =>
        prev.map((entry) =>
          entry.habitId === item.habitId ? { ...entry, completed: checked } : entry
        )
      );
      if (selectedHabitId === item.habitId) {
        await refreshHabitStats(item.habitId);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (loading) {
    return <main className="page"><p>Loading...</p></main>;
  }

  return (
    <main className="page">
      <header className="topbar">
        <h1>Leetbit Habit Tracker</h1>
      </header>

      <section className="layout">
        <div className="panel main-panel">
          <div className="tabs">
            <button
              type="button"
              className={activeTab === "dashboard" ? "tab-btn active" : "tab-btn"}
              onClick={() => setActiveTab("dashboard")}
            >
              Dashboard
            </button>
            <button
              type="button"
              className={activeTab === "analytics" ? "tab-btn active" : "tab-btn"}
              onClick={() => setActiveTab("analytics")}
            >
              Analytics
            </button>
          </div>

          <div className="panel-header">
            <h2>{activeTab === "dashboard" ? "Dashboard" : "Analytics"}</h2>
            <div className="habit-select">
              <label htmlFor="habitSelect">Habit</label>
              <select
                id="habitSelect"
                value={selectedHabitId ?? ""}
                onChange={(e) => setSelectedHabitId(Number(e.target.value))}
                disabled={habits.length === 0}
              >
                {habits.map((habit) => (
                  <option value={habit.id} key={habit.id}>
                    {habit.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {activeTab === "dashboard" && (
            <>
              {selectedHabit ? (
                <>
                  <div className="stats-grid">
                    <div className="stat-card">
                      <p className="stat-label">Consistency % ({currentYear})</p>
                      <p className="stat-value">{summary?.year.consistency ?? 0}%</p>
                      <p className="muted">
                        {summary?.year.completed ?? 0}/{summary?.year.total ?? 0} days done
                      </p>
                    </div>
                    <div className="stat-card">
                      <p className="stat-label">This Week</p>
                      <p className="stat-value">{summary?.currentWeek.consistency ?? 0}%</p>
                      <p className="muted">
                        {summary?.currentWeek.completed ?? 0}/{summary?.currentWeek.total ?? 0}{" "}
                        days
                      </p>
                    </div>
                    <div className="stat-card">
                      <p className="stat-label">This Month</p>
                      <p className="stat-value">{summary?.currentMonth.consistency ?? 0}%</p>
                      <p className="muted">
                        {summary?.currentMonth.completed ?? 0}/{summary?.currentMonth.total ?? 0}{" "}
                        days
                      </p>
                    </div>
                  </div>
                  <HeatmapChart
                    year={currentYear}
                    habitName={selectedHabit.name}
                    data={heatmapData}
                  />
                </>
              ) : (
                <div className="empty-state">
                  Add your first habit to start tracking.
                </div>
              )}

              <div className="checklist">
                <div className="checklist-header">
                  <h3>Daily Checklist</h3>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>

                {checklist.length === 0 ? (
                  <p className="muted">No habits yet. Add one from the right panel.</p>
                ) : (
                  <ul>
                    {checklist.map((item) => (
                      <li key={item.habitId}>
                        <label>
                          <input
                            type="checkbox"
                            checked={item.completed}
                            onChange={(e) => void toggleHabit(item, e.target.checked)}
                          />
                          <span>{item.name}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {activeTab === "analytics" && summary && (
            <div className="summary-grid">
              <div className="summary-panel">
                <h3>Weekly Summary (Last 8 Weeks)</h3>
                <ul>
                  {summary.weekly.map((item) => (
                    <li key={item.label}>
                      <span>{item.label}</span>
                      <span>
                        {item.consistency}% ({item.completed}/{item.total})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="summary-panel">
                <h3>Monthly Summary ({currentYear})</h3>
                <ul>
                  {summary.monthly.map((item) => (
                    <li key={item.label}>
                      <span>{item.label}</span>
                      <span>
                        {item.consistency}% ({item.completed}/{item.total})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {activeTab === "analytics" && !summary && (
            <div className="empty-state">
              Add your first habit to view analytics.
            </div>
          )}
        </div>

        <aside className="panel side-panel">
          <h2>Add Habit</h2>
          <form onSubmit={handleCreateHabit} className="add-habit-form">
            <input
              type="text"
              value={newHabitName}
              onChange={(e) => setNewHabitName(e.target.value)}
              placeholder="e.g. Solve 1 problem"
              required
            />
            <button type="submit">Add Habit</button>
          </form>
          <p className="muted">At least one habit is required to display the heatmap.</p>
          {error && <p className="error">{error}</p>}
        </aside>
      </section>
    </main>
  );
}
