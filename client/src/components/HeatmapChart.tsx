import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts";

export interface HabitHeatmapProps {
  startDate: string;
  endDate: string;
  data: { date: string; count: number }[];
  selectedRange: string;
  rangeOptions: Array<{ value: string; label: string }>;
  onRangeChange: (value: string) => void;
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

export default function HabitHeatmap({
  startDate,
  endDate,
  data,
  selectedRange,
  rangeOptions,
  onRangeChange
}: HabitHeatmapProps) {
  const chartRef = useRef<HTMLDivElement | null>(null);

  const { chartData, monthSegments, chartWidth } = useMemo(() => {
    const start = parseIsoDate(startDate);
    const end = parseIsoDate(endDate);
    const countMap = new Map(data.map((entry) => [entry.date, entry.count]));
    const values: [string, number, number][] = [];
    const segments: Array<{ key: string; start: string; end: string; left: number }> = [];
    const cellSize = 14;
    const monthGap = 14;
    const sidePadding = 20;

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
        borderWidth: 1,
        borderColor: "#0b1f3a",
        borderRadius: 3
      },
      yearLabel: { show: false },
      monthLabel: {
        show: true,
        color: "#8b949e",
        fontSize: 12,
        margin: 8
      },
      dayLabel: { show: false }
    }));

    chart.setOption({
      backgroundColor: "transparent",
      tooltip: {
        position: "top",
        backgroundColor: "#102544",
        borderColor: "#1e3a5f",
        borderWidth: 1,
        textStyle: { color: "#e2e8f0" },
        formatter: (params: { data: [string, number, number] }) => {
          const [date, _level, count] = params.data;
          return `${date}<br/>Completed: ${count}`;
        }
      },
      visualMap: {
        min: 0,
        max: 4,
        show: false,
        inRange: {
          color: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"]
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
  }, [chartData, endDate, monthSegments, startDate]);

  return (
    <div className="heatmap-shell">
      <div className="heatmap-toolbar">
        <select
          className="heatmap-range-select"
          value={selectedRange}
          onChange={(e) => onRangeChange(e.target.value)}
        >
          {rangeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
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
