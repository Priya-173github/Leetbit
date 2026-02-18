import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { CheckinPoint } from "../api";

interface HeatmapChartProps {
  habitName: string;
  startDate: string;
  endDate: string;
  data: CheckinPoint[];
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toIso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function computeMaxStreak(valuesByDate: Map<string, number>, start: string, end: string) {
  let streak = 0;
  let maxStreak = 0;
  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);
  for (let d = new Date(startDate); d <= endDate; d = addDays(d, 1)) {
    if ((valuesByDate.get(toIso(d)) ?? 0) > 0) {
      streak += 1;
      if (streak > maxStreak) maxStreak = streak;
    } else {
      streak = 0;
    }
  }
  return maxStreak;
}

export function HeatmapChart({ habitName, startDate, endDate, data }: HeatmapChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = echarts.init(containerRef.current);
    const valuesByDate = new Map(data.map((item) => [item.date, item.completed]));
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    const dayValues: [string, number][] = [];
    let completedDays = 0;

    for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      const done = valuesByDate.get(iso) ?? 0;
      if (done > 0) completedDays += 1;
      dayValues.push([iso, done > 0 ? 4 : 0]);
    }
    const maxStreak = computeMaxStreak(valuesByDate, startDate, endDate);

    chart.setOption({
      tooltip: {
        position: "top",
        backgroundColor: "#0f172a",
        borderColor: "#334155",
        borderWidth: 1,
        textStyle: {
          color: "#e2e8f0"
        },
        formatter: (params: { data: [string, number] }) => {
          const [date, value] = params.data;
          return `${date}<br/>${habitName}: ${value > 0 ? "Done" : "Missed"}`;
        }
      },
      title: [
        {
          text: `${completedDays} completions in the past one year`,
          left: 6,
          top: 4,
          textStyle: {
            color: "#e2e8f0",
            fontSize: 16,
            fontWeight: 500
          }
        },
        {
          text: `Total active days: ${completedDays}    Max streak: ${maxStreak}`,
          right: 8,
          top: 8,
          textStyle: {
            color: "#cbd5e1",
            fontSize: 12,
            fontWeight: 400
          }
        }
      ],
      visualMap: {
        min: 0,
        max: 4,
        calculable: false,
        show: false,
        inRange: {
          color: ["#2d333b", "#0e4429", "#006d32", "#26a641", "#39d353"]
        }
      },
      calendar: {
        top: 48,
        left: 12,
        right: 12,
        cellSize: [14, 14],
        range: [startDate, endDate],
        itemStyle: {
          borderWidth: 1,
          borderColor: "#0f172a"
        },
        yearLabel: { show: false },
        monthLabel: {
          nameMap: "en",
          color: "#94a3b8"
        },
        dayLabel: {
          firstDay: 0,
          nameMap: ["", "Mon", "", "Wed", "", "Fri", ""],
          color: "#64748b",
          fontSize: 10
        }
      },
      series: [
        {
          type: "heatmap",
          coordinateSystem: "calendar",
          data: dayValues
        }
      ]
    });

    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, [data, endDate, habitName, startDate]);

  return <div className="heatmap" ref={containerRef} />;
}
