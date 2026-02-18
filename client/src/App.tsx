import { FormEvent, useEffect, useMemo, useState } from "react";
import { BsFire } from "react-icons/bs";
import { FiCalendar, FiTarget, FiTrendingUp } from "react-icons/fi";
import {
  getAllHeatmap,
  getAllSummary,
  getAllYears,
  createHabit,
  deleteHabit,
  getDayChecklist,
  getHabitHeatmap,
  getHabitSummary,
  getHabitYears,
  getStreak,
  listHabits,
  updateChecklistItem,
  type CheckinPoint,
  type DayChecklistItem,
  type Habit,
  type HabitSummary
} from "./api";
import HabitHeatmap from "./components/HeatmapChart";
import { AnalyticsPanel } from "./components/AnalyticsPanel";

const todayISO = new Date().toISOString().slice(0, 10);
const currentYear = new Date().getFullYear();
type Tab = "dashboard" | "analytics";

export function App() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [selectedHabitId, setSelectedHabitId] = useState<number | null>(null);
  const [heatmapData, setHeatmapData] = useState<CheckinPoint[]>([]);
  const [summary, setSummary] = useState<HabitSummary | null>(null);
  const [checklist, setChecklist] = useState<DayChecklistItem[]>([]);
  const [newHabitName, setNewHabitName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [isHabitModalOpen, setIsHabitModalOpen] = useState(false);
  const [isManageHabitsOpen, setIsManageHabitsOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [streakCount, setStreakCount] = useState(0);
  const [heatmapRange, setHeatmapRange] = useState<string>(String(currentYear));
  const [availableYears, setAvailableYears] = useState<number[]>([currentYear]);
  const [heatmapWindow, setHeatmapWindow] = useState<{ start: string; end: string }>({
    start: `${currentYear}-01-01`,
    end: `${currentYear}-12-31`
  });

  const heatmapRangeOptions = useMemo(() => {
    const baseYears = new Set<number>(availableYears);
    baseYears.add(currentYear);
    return [...baseYears]
      .sort((a, b) => b - a)
      .map((year) => ({ value: String(year), label: String(year) }));
  }, [availableYears]);

  const selectedHabit = useMemo(
    () => habits.find((habit) => habit.id === selectedHabitId) ?? null,
    [habits, selectedHabitId]
  );
  const isAllHabits = selectedHabitId === -1;
  const allTodayDone = useMemo(
    () => checklist.length > 0 && checklist.every((item) => item.completed),
    [checklist]
  );
  useEffect(() => {
    void bootstrap();
  }, []);
  useEffect(() => {
    if (theme === "light") {
      document.body.classList.add("light-theme");
    } else {
      document.body.classList.remove("light-theme");
    }
  }, [theme]);

  useEffect(() => {
    if (!selectedHabitId) return;
    void refreshHabitStats(selectedHabitId);
  }, [selectedHabitId, heatmapRange]);

  useEffect(() => {
    if (heatmapRangeOptions.length === 0) return;
    const hasSelected = heatmapRangeOptions.some((option) => option.value === heatmapRange);
    if (!hasSelected) {
      setHeatmapRange(String(currentYear));
    }
  }, [heatmapRange, heatmapRangeOptions]);

  useEffect(() => {
    if (habits.length === 0) return;
    void refreshChecklist(todayISO);
  }, [habits.length]);

  async function bootstrap() {
    try {
      setLoading(true);
      const data = await listHabits();
      setHabits(data);
      if (data.length > 0) {
        setSelectedHabitId(-1);
      }
      if (data.length > 0) {
        const [daily] = await Promise.all([getDayChecklist(todayISO)]);
        setChecklist(daily);
      }
      const streak = await getStreak();
      setStreakCount(streak.streak);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshHabitStats(habitId: number) {
    const selectedYear = Number(heatmapRange);
    const resolvedWindow = { start: `${selectedYear}-01-01`, end: `${selectedYear}-12-31` };

    setHeatmapWindow(resolvedWindow);

    try {
      setError(null);
      if (habitId === -1) {
        const [years, heatmap, summaryData] = await Promise.all([
          getAllYears(),
          getAllHeatmap({ year: selectedYear }),
          getAllSummary(selectedYear)
        ]);
        setAvailableYears(years);
        setHeatmapData(heatmap);
        setSummary(summaryData);
      } else {
        const [years, heatmap, summaryData] = await Promise.all([
          getHabitYears(habitId),
          getHabitHeatmap(habitId, { year: selectedYear }),
          getHabitSummary(habitId, selectedYear)
        ]);
        setAvailableYears(years);
        setHeatmapData(heatmap);
        setSummary(summaryData);
      }
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
      setIsHabitModalOpen(false);
      if (!selectedHabitId) {
        setSelectedHabitId(-1);
      }
      setHeatmapRange(String(currentYear));
      await refreshChecklist(todayISO);
      const streak = await getStreak();
      setStreakCount(streak.streak);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleDeleteHabit(habitId: number) {
    const target = habits.find((h) => h.id === habitId);
    if (!target) return;
    const confirmed = window.confirm(
      `Delete "${target.name}" from today onward? Historical data up to yesterday will remain.`
    );
    if (!confirmed) return;

    try {
      setError(null);
      await deleteHabit(habitId);
      const nextHabits = habits.filter((h) => h.id !== habitId);
      setHabits(nextHabits);

      if (selectedHabitId === habitId) {
        if (nextHabits.length > 0) {
          setSelectedHabitId(-1);
        } else {
          setSelectedHabitId(null);
          setHeatmapData([]);
          setSummary(null);
        }
      }

      await refreshChecklist(todayISO);
      const streak = await getStreak();
      setStreakCount(streak.streak);
      if (nextHabits.length === 0) {
        setIsManageHabitsOpen(false);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function toggleHabit(item: DayChecklistItem, checked: boolean) {
    try {
      setError(null);
      await updateChecklistItem(item.habitId, todayISO, checked);
      setChecklist((prev) =>
        prev.map((entry) =>
          entry.habitId === item.habitId ? { ...entry, completed: checked } : entry
        )
      );
      if (selectedHabitId === item.habitId) {
        await refreshHabitStats(item.habitId);
      }
      if (selectedHabitId === -1) {
        await refreshHabitStats(-1);
      }
      const streak = await getStreak();
      setStreakCount(streak.streak);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function handleExportData() {
    const payload = {
      exportedAt: new Date().toISOString(),
      selectedHabit,
      selectedYear: Number(heatmapRange),
      streak: streakCount,
      habits,
      checklistForToday: checklist,
      heatmapData,
      summary
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leetbit-export-${todayISO}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <main className="page"><p>Loading...</p></main>;
  }

  return (
    <main className="page">
      <header className="navbar">
        <div className="nav-left">
          <div className="brand">
            <div className="brand-logo">LB</div>
            <div className="brand-name">Leetbit</div>
          </div>
          <nav className="nav-links">
            <button
              type="button"
              className={activeTab === "dashboard" ? "nav-link active" : "nav-link"}
              onClick={() => setActiveTab("dashboard")}
            >
              Dashboard
            </button>
            <button
              type="button"
              className={activeTab === "analytics" ? "nav-link active" : "nav-link"}
              onClick={() => setActiveTab("analytics")}
            >
              Analytics
            </button>
          </nav>
        </div>
        <div className="nav-right">
          <div className={allTodayDone ? "nav-chip nav-chip-done" : "nav-chip nav-chip-pending"}>
            <BsFire className="streak-fire-icon" /> {streakCount}
          </div>
          <button
            type="button"
            className="theme-btn"
            onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <button type="button" className="export-btn" onClick={handleExportData}>
            Export Data
          </button>
          <button
            type="button"
            className="add-habit-btn"
            onClick={() => setIsHabitModalOpen(true)}
          >
            Add Habit
          </button>
        </div>
      </header>

      <section className="layout">
        <div className="panel main-panel">
          <div className="panel-header">
            <h2>{activeTab === "dashboard" ? "Dashboard" : "Analytics"}</h2>
          </div>

          {activeTab === "dashboard" && (
            <>
              {selectedHabit || isAllHabits ? (
                <>
                  {summary && (
                    <div className="stats-grid">
                      <div className="stat-card">
                        <div className="stat-head">
                          <span className="stat-icon"><FiTarget /></span>
                          <p className="stat-label">Consistency % ({currentYear})</p>
                        </div>
                        <div className="stat-progress-stack">
                          <p className="stat-value">{summary?.year.consistency ?? 0}%</p>
                          <div className="stat-bar">
                            <span
                              style={{ width: `${summary?.year.consistency ?? 0}%` }}
                            />
                          </div>
                        </div>
                        <p className="muted">
                          {summary?.year.completed ?? 0}/{summary?.year.total ?? 0} days done
                        </p>
                      </div>
                      <div className="stat-card">
                        <div className="stat-head">
                          <span className="stat-icon"><FiCalendar /></span>
                          <p className="stat-label">This Week</p>
                        </div>
                        <div className="stat-progress-stack">
                          <p className="stat-value">{summary?.currentWeek.consistency ?? 0}%</p>
                          <div className="stat-bar">
                            <span
                              style={{ width: `${summary?.currentWeek.consistency ?? 0}%` }}
                            />
                          </div>
                        </div>
                        <p className="muted">
                          {summary?.currentWeek.completed ?? 0}/{summary?.currentWeek.total ?? 0}{" "}
                          days
                        </p>
                      </div>
                      <div className="stat-card">
                        <div className="stat-head">
                          <span className="stat-icon"><FiTrendingUp /></span>
                          <p className="stat-label">This Month</p>
                        </div>
                        <div className="stat-progress-stack">
                          <p className="stat-value">{summary?.currentMonth.consistency ?? 0}%</p>
                          <div className="stat-bar">
                            <span
                              style={{ width: `${summary?.currentMonth.consistency ?? 0}%` }}
                            />
                          </div>
                        </div>
                        <p className="muted">
                          {summary?.currentMonth.completed ?? 0}/{summary?.currentMonth.total ?? 0}{" "}
                          days
                        </p>
                      </div>
                    </div>
                  )}
                  <HabitHeatmap
                    startDate={heatmapWindow.start}
                    endDate={heatmapWindow.end}
                    data={heatmapData.map((item) => ({
                      date: item.date,
                      count: item.completed
                    }))}
                    theme={theme}
                    selectedHabitId={selectedHabitId}
                    habitOptions={[
                      { value: -1, label: "All" },
                      ...habits.map((habit) => ({
                        value: habit.id,
                        label: habit.name
                      }))
                    ]}
                    onHabitChange={setSelectedHabitId}
                    onOpenManageHabits={() => setIsManageHabitsOpen(true)}
                    selectedYear={heatmapRange}
                    yearOptions={heatmapRangeOptions}
                    onYearChange={setHeatmapRange}
                  />
                </>
              ) : (
                <div className="empty-state">
                  Add your first habit to start tracking.
                </div>
              )}

              <div className="checklist">
                <div className="checklist-header">
                  <h3>Daily Checklist (Today: {todayISO})</h3>
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
            <AnalyticsPanel summary={summary} year={Number(heatmapRange)} />
          )}

          {activeTab === "analytics" && !summary && (
            <div className="empty-state">
              Add your first habit to view analytics.
            </div>
          )}
        </div>

      </section>

      {error && <p className="error">{error}</p>}
      {isHabitModalOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setIsHabitModalOpen(false)}
          role="presentation"
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <h2>Add Habit</h2>
            <form onSubmit={handleCreateHabit} className="add-habit-form">
              <input
                type="text"
                value={newHabitName}
                onChange={(e) => setNewHabitName(e.target.value)}
                placeholder="e.g. Yoga"
                required
              />
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => setIsHabitModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit">Add Habit</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isManageHabitsOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setIsManageHabitsOpen(false)}
          role="presentation"
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <h2>Edit Habits</h2>
            {habits.length === 0 ? (
              <p className="muted">No active habits.</p>
            ) : (
              <ul className="manage-habits-list">
                {habits.map((habit) => (
                  <li key={habit.id}>
                    <span>{habit.name}</span>
                    <button
                      type="button"
                      className="delete-habit-btn"
                      onClick={() => void handleDeleteHabit(habit.id)}
                      aria-label={`Delete ${habit.name}`}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setIsManageHabitsOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}




