"use client";

type Point = {
  day: string;
  value: number;
};

type RevenueChartProps = {
  historical: Point[];
  forecast: Point[];
};

function buildPolyline(points: Point[], width: number, height: number, pad: number, minY: number, maxY: number) {
  if (points.length === 0) return "";

  const stepX = points.length === 1 ? 0 : (width - 2 * pad) / (points.length - 1);
  const rangeY = maxY - minY || 1;

  return points
    .map((p, i) => {
      const x = pad + i * stepX;
      const y = height - pad - ((p.value - minY) / rangeY) * (height - 2 * pad);
      return `${x},${y}`;
    })
    .join(" ");
}

export default function RevenueChart({ historical, forecast }: RevenueChartProps) {
  const width = 900;
  const height = 360;
  const pad = 40;

  const all = [...historical, ...forecast];
  const values = all.map((p) => p.value);

  const minY = values.length ? Math.min(...values) : 0;
  const maxY = values.length ? Math.max(...values) : 100;

  const historicalLine = buildPolyline(historical, width, height, pad, minY, maxY);
  const forecastLine = buildPolyline(forecast, width, height, pad, minY, maxY);

  return (
    <div className="w-full rounded-xl border border-gray-200 bg-white p-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#d1d5db" />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="#d1d5db" />

        {historicalLine && (
          <polyline
            fill="none"
            stroke="#2563eb"
            strokeWidth="3"
            points={historicalLine}
          />
        )}

        {forecastLine && (
          <polyline
            fill="none"
            stroke="#dc2626"
            strokeWidth="3"
            strokeDasharray="8 6"
            points={forecastLine}
          />
        )}
      </svg>

      <div className="mt-4 flex gap-6 text-sm">
        <div className="flex items-center gap-2">
          <span className="inline-block h-[3px] w-8 bg-blue-600" />
          <span>Historical</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-[3px] w-8 border-t-[3px] border-dashed border-red-600" />
          <span>Forecast</span>
        </div>
      </div>
    </div>
  );
}