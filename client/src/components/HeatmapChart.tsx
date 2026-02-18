import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";

export interface HabitHeatmapProps {
  startDate: string;
  endDate: string;
  data: { date: string; count: number }[];
  theme: "dark" | "light";
  selectedHabitId: number | null;
  habitOptions: Array<{ value: number; label: string }>;
  onHabitChange: (habitId: number) => void;
  onOpenManageHabits: () => void;
  selectedYear: string;
  yearOptions: Array<{ value: string; label: string }>;
  onYearChange: (year: string) => void;
}

function parseIsoDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toHeatLevel(count: number) {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function endOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function minDate(a: Date, b: Date) {
  return a < b ? a : b;
}

function maxDate(a: Date, b: Date) {
  return a > b ? a : b;
}

function weekColumnsInRange(start: Date, end: Date) {
  const dayOffset = start.getUTCDay();
  const dayCount = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  return Math.ceil((dayOffset + dayCount) / 7);
}

interface CustomSelectProps {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}

function CustomSelect({ label, value, options, onChange }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const current = options.find((opt) => opt.value === value);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div className="heatmap-select-group" ref={rootRef}>
      <label>{label}</label>
      <button
        type="button"
        className={`select-trigger ${open ? "open" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{current?.label ?? ""}</span>
        <span className="select-caret">⌄</span>
      </button>
      {open && (
        <div className="select-menu">
          {options.map((option) => (
            <button
              type="button"
              key={option.value}
              className={`select-option ${option.value === value ? "active" : ""} ${option.value === "__edit__" ? "edit-option" : ""}`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.value === "__edit__" ? (
                <span className="edit-option-label">
                  <span className="edit-option-icon">✎</span>
                  {option.label}
                </span>
              ) : (
                option.label
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function HabitHeatmap({
  startDate,
  endDate,
  data,
  theme,
  selectedHabitId,
  habitOptions,
  onHabitChange,
  onOpenManageHabits,
  selectedYear,
  yearOptions,
  onYearChange
}: HabitHeatmapProps) {
  const chartRef = useRef<HTMLDivElement | null>(null);

  const { chartData, monthSegments, chartWidth } = useMemo(() => {
    const start = parseIsoDate(startDate);
    const end = parseIsoDate(endDate);
    const countMap = new Map(data.map((entry) => [entry.date, entry.count]));
    const values: [string, number, number][] = [];
    const segments: Array<{ key: string; start: string; end: string; left: number }> = [];
    const cellSize = 16;
    const monthGap = 4;
    const sidePadding = 32;

    for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = toIsoDate(d);
      const count = countMap.get(iso) ?? 0;
      values.push([iso, toHeatLevel(count), count]);
    }

    let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    let left = sidePadding;

    while (cursor <= end) {
      const segStart = maxDate(start, new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1)));
      const segEnd = minDate(end, endOfMonth(cursor));
      const columns = weekColumnsInRange(segStart, segEnd);
      const width = columns * cellSize;

      segments.push({
        key: monthKey(segStart),
        start: toIsoDate(segStart),
        end: toIsoDate(segEnd),
        left
      });

      left += width + monthGap;
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }

    return {
      chartData: values,
      monthSegments: segments,
      chartWidth: Math.max(left + sidePadding - monthGap, 520)
    };
  }, [data, endDate, startDate]);

  useEffect(() => {
    if (!chartRef.current) return;

    const chart = echarts.init(chartRef.current);
    const calendars = monthSegments.map((segment) => ({
      top: 30,
      left: segment.left,
      range: [segment.start, segment.end],
      splitLine: { show: false },
      cellSize: [14, 14],
      itemStyle: {
        borderWidth: 0.2,
        borderColor: theme === "light" ? "#e5edf7" : "#0e2a4a",
        borderRadius: 4
      },
      yearLabel: { show: false },
      monthLabel: {
        show: true,
        color: theme === "light" ? "#64748b" : "#8b949e",
        fontSize: 12,
        margin: 8
      },
      dayLabel: { show: false }
    }));

    chart.setOption({
      backgroundColor: "transparent",
      tooltip: {
        appendToBody: true,
        confine: false,
        position: "top",
        backgroundColor: theme === "light" ? "#ffffff" : "#102544",
        borderColor: theme === "light" ? "#bfd0ea" : "#1e3a5f",
        borderWidth: 1,
        textStyle: { color: theme === "light" ? "#0f172a" : "#e2e8f0" },
        formatter: (params: { data: [string, number, number] }) => {
          const [date, _level, count] = params.data;
          return `${date}<br/>Completed: ${count}`;
        }
      },
      visualMap: {
        min: 0,
        max: 4,
        show: false,
        type: "piecewise",
        inRange: {
          color:
            theme === "light"
              ? ["#eef3f8", "#9be9a8", "#40c463", "#30a14e", "#216e39"]
              : ["#0e1f33", "#0e4429", "#006d32", "#26a641", "#39d353"]
        }
      },
      calendar: calendars,
      series: calendars.map((_c, index) => ({
        type: "heatmap",
        coordinateSystem: "calendar",
        calendarIndex: index,
        data: chartData.filter((row) => {
          const date = row[0];
          const segment = monthSegments[index];
          return date >= segment.start && date <= segment.end;
        })
      }))
    });

    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, [chartData, endDate, monthSegments, startDate, theme]);

  return (
    <div className="heatmap-shell">
      <div className="heatmap-toolbar">
        <CustomSelect
          label="Habit"
          value={String(selectedHabitId ?? "")}
          options={[
            ...habitOptions.map((option) => ({
              value: String(option.value),
              label: option.label
            })),
            { value: "__edit__", label: "Edit Habits" }
          ]}
          onChange={(value) => {
            if (value === "__edit__") {
              onOpenManageHabits();
              return;
            }
            onHabitChange(Number(value));
          }}
        />
        <CustomSelect
          label="Year"
          value={selectedYear}
          options={yearOptions}
          onChange={onYearChange}
        />
      </div>
      <div className="heatmap-scroll">
        <div
          className="heatmap"
          ref={chartRef}
          style={{ minWidth: `${chartWidth}px` }}
        />
      </div>
    </div>
  );
}
