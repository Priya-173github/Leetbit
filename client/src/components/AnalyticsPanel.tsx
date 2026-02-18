import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { HabitSummary } from "../api";

interface AnalyticsPanelProps {
  summary: HabitSummary;
  year: number;
}

export function AnalyticsPanel({ summary, year }: AnalyticsPanelProps) {
  const weeklyBarRef = useRef<HTMLDivElement | null>(null);
  const monthlyLineRef = useRef<HTMLDivElement | null>(null);
  const comparisonBarRef = useRef<HTMLDivElement | null>(null);
  const pieRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!weeklyBarRef.current || !monthlyLineRef.current) return;

    const weeklyBar = echarts.init(weeklyBarRef.current);
    const monthlyLine = echarts.init(monthlyLineRef.current);
    const comparisonBar = comparisonBarRef.current ? echarts.init(comparisonBarRef.current) : null;
    const pie = pieRef.current ? echarts.init(pieRef.current) : null;

    weeklyBar.setOption({
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", valueFormatter: (v: number) => `${v}% tasks completed` },
      grid: { left: 30, right: 12, top: 20, bottom: 24 },
      xAxis: {
        type: "category",
        data: summary.weekly.map((_w, i) => `W${i + 1}`),
        axisLabel: { color: "#94a3b8" },
        axisLine: { lineStyle: { color: "#334155" } }
      },
      yAxis: {
        type: "value",
        max: 100,
        axisLabel: { color: "#94a3b8", formatter: "{value}%" },
        splitLine: { lineStyle: { color: "#1e293b" } }
      },
      series: [
        {
          type: "bar",
          data: summary.weekly.map((w) => w.consistency),
          itemStyle: { color: "#22c55e", borderRadius: [4, 4, 0, 0] }
        }
      ]
    });

    monthlyLine.setOption({
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", valueFormatter: (v: number) => `${v}% tasks completed` },
      grid: { left: 30, right: 12, top: 20, bottom: 24 },
      xAxis: {
        type: "category",
        data: summary.monthly.map((m) => m.label.split(" ")[0]),
        axisLabel: { color: "#94a3b8" },
        axisLine: { lineStyle: { color: "#334155" } }
      },
      yAxis: {
        type: "value",
        max: 100,
        axisLabel: { color: "#94a3b8", formatter: "{value}%" },
        splitLine: { lineStyle: { color: "#1e293b" } }
      },
      series: [
        {
          type: "line",
          smooth: true,
          symbol: "circle",
          symbolSize: 7,
          data: summary.monthly.map((m) => m.consistency),
          lineStyle: { color: "#3b82f6", width: 3 },
          itemStyle: { color: "#3b82f6" },
          areaStyle: { color: "rgba(59,130,246,0.2)" }
        }
      ]
    });

    if (comparisonBar) {
      const comparison = summary.habitComparison
        .slice()
        .sort((a, b) => b.consistency - a.consistency);
      comparisonBar.setOption({
        backgroundColor: "transparent",
        tooltip: { trigger: "axis", valueFormatter: (v: number) => `${v}% tasks completed` },
        grid: { left: 70, right: 12, top: 20, bottom: 24 },
        xAxis: {
          type: "value",
          max: 100,
          axisLabel: { color: "#94a3b8", formatter: "{value}%" },
          splitLine: { lineStyle: { color: "#1e293b" } }
        },
        yAxis: {
          type: "category",
          data: comparison.map((item) => item.name),
          axisLabel: { color: "#94a3b8" },
          axisLine: { lineStyle: { color: "#334155" } }
        },
        series: [
          {
            type: "bar",
            data: comparison.map((item) => item.consistency),
            itemStyle: { color: "#a78bfa", borderRadius: [0, 4, 4, 0] }
          }
        ]
      });
    }

    if (pie) {
      pie.setOption({
        backgroundColor: "transparent",
        tooltip: { trigger: "item" },
        legend: { bottom: 0, textStyle: { color: "#cbd5e1" } },
        series: [
          {
            type: "pie",
            radius: ["45%", "70%"],
            data: [
              { value: summary.year.completed, name: "Completed", itemStyle: { color: "#22c55e" } },
              {
                value: Math.max(summary.year.total - summary.year.completed, 0),
                name: "Missed",
                itemStyle: { color: "#334155" }
              }
            ],
            label: { color: "#e2e8f0" }
          }
        ]
      });
    }

    const onResize = () => {
      weeklyBar.resize();
      monthlyLine.resize();
      comparisonBar?.resize();
      pie?.resize();
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      weeklyBar.dispose();
      monthlyLine.dispose();
      comparisonBar?.dispose();
      pie?.dispose();
    };
  }, [summary]);

  const canCompareHabits = summary.habitComparison.length > 1;

  return (
    <div className="analytics-wrap">
      <div className="analytics-top-row">
        <div className="analytics-metric-card">
          <p>Consistency %</p>
          <h3>{summary.year.consistency}%</h3>
        </div>
        <div className="analytics-metric-card">
          <p>Current Streak 🔥</p>
          <h3>{summary.currentStreak}</h3>
        </div>
        <div className="analytics-metric-card">
          <p>Longest Streak</p>
          <h3>{summary.longestStreak}</h3>
        </div>
        <div className="analytics-metric-card">
          <p>Total Completions</p>
          <h3>{summary.lifetimeCompletions} days completed</h3>
        </div>
      </div>

      <div className="analytics-middle-row">
        <div className="analytics-card">
          <h3>Weekly Bars: % Tasks Completed</h3>
          <div className="analytics-chart" ref={weeklyBarRef} />
        </div>
        <div className="analytics-card">
          <h3>Monthly Trend Line: % Tasks Completed</h3>
          <div className="analytics-chart" ref={monthlyLineRef} />
        </div>
      </div>

      <div className="analytics-bottom-row">
        <div className="analytics-card">
          <h3>Best Day</h3>
          <p className="analytics-text">{summary.bestDay}</p>
        </div>
        <div className="analytics-card">
          <h3>Missed Day Insight</h3>
          <p className="analytics-text">{summary.missedDayInsight}</p>
        </div>
        <div className="analytics-card">
          <h3>Total Completions</h3>
          <p className="analytics-text">{summary.lifetimeCompletions} days completed</p>
        </div>
      </div>

      {canCompareHabits && (
        <div className="analytics-middle-row">
          <div className="analytics-card">
            <h3>Habit Comparison (% Tasks Completed)</h3>
            <div className="analytics-chart" ref={comparisonBarRef} />
          </div>
          <div className="analytics-card">
            <h3>{year} Completed vs Missed</h3>
            <div className="analytics-chart" ref={pieRef} />
          </div>
        </div>
      )}
    </div>
  );
}
