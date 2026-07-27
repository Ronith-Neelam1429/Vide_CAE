import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SensitivityEntry } from "../../lib/simulation";

const AXIS = {
  tick: { fill: "#909090", fontSize: 10 },
  tickLine: false,
  axisLine: { stroke: "#4a4a4a" },
} as const;

type SensitivityTornadoProps = {
  sensitivity: SensitivityEntry[];
};

export function SensitivityTornado({ sensitivity }: SensitivityTornadoProps) {
  const data = useMemo(
    () =>
      [...sensitivity]
        .sort((a, b) => b.peakBasalSpanC - a.peakBasalSpanC)
        .map((entry) => ({
          parameter: entry.parameter,
          spanC: entry.peakBasalSpanC,
          range: `${entry.low.toPrecision(3)}–${entry.high.toPrecision(3)} ${entry.unit}`,
          lowC: entry.peakBasalLowC,
          highC: entry.peakBasalHighC,
        })),
    [sensitivity],
  );

  if (data.length === 0) return null;

  const height = Math.max(180, data.length * 28 + 48);

  return (
    <div className="results-chart sensitivity-tornado" aria-label="Parameter sensitivity tornado">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 16, bottom: 4, left: 8 }}
        >
          <CartesianGrid stroke="#3d3d3d" strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            unit=" °C"
            {...AXIS}
            label={{
              value: "Peak basal span (°C)",
              position: "insideBottom",
              offset: -2,
              fill: "#707070",
              fontSize: 10,
            }}
          />
          <YAxis
            type="category"
            dataKey="parameter"
            width={118}
            tick={{ fill: "#b0b0b0", fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: "#4a4a4a" }}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(29,29,29,0.96)",
              border: "1px solid #3a3a3a",
              borderRadius: 6,
              fontSize: 10,
            }}
            formatter={(value) => [`${Number(value).toFixed(3)} °C`, "Peak basal span"]}
            labelFormatter={(label, payload) => {
              const row = payload?.[0]?.payload as
                | { range?: string; lowC?: number; highC?: number }
                | undefined;
              if (!row) return String(label);
              return `${label} · ${row.range ?? ""} · ${row.lowC?.toFixed(2)}–${row.highC?.toFixed(2)} °C`;
            }}
          />
          <Bar
            dataKey="spanC"
            name="Peak basal span"
            fill="#0696d7"
            radius={[0, 3, 3, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
      <p className="results-chart__caption">
        One-at-a-time parameter sweeps — longer bars swing peak basal temperature more.
      </p>
    </div>
  );
}
