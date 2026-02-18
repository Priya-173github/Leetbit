import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { CheckinPoint } from "../api";

interface HeatmapChartProps {
  year: number;
  habitName: string;
  data: CheckinPoint[];
}

export function HeatmapChart({ year, habitName, data }: HeatmapChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = echarts.init(containerRef.current);
    const valuesByDate = new Map(data.map((item) => [item.date, item.completed]));

    const start = new Date(`${year}-01-01`);
    const end = new Date(`${year}-12-31`);
    const dayValues: [string, number][] = [];

    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      dayValues.push([iso, valuesByDate.get(iso) ?? 0]);
    }

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
          return `${date}<br/>${habitName}: ${value === 1 ? "Done" : "Missed"}`;
        }
      },
      visualMap: {
        min: 0,
        max: 1,
        calculable: false,
        orient: "horizontal",
        left: "center",
        top: 0,
        inRange: {
          color: ["#1e293b", "#22c55e"]
        },
        text: ["Done", "Missed"]
      },
      calendar: {
        top: 60,
        left: 20,
        right: 20,
        cellSize: ["auto", 16],
        range: String(year),
        itemStyle: {
          borderWidth: 2,
          borderColor: "#0b1220"
        },
        yearLabel: { show: false },
        monthLabel: {
          nameMap: "en",
          color: "#94a3b8"
        },
        dayLabel: {
          firstDay: 1,
          nameMap: "en",
          color: "#94a3b8"
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
  }, [data, habitName, year]);

  return <div className="heatmap" ref={containerRef} />;
}
