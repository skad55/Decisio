"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ForecastPoint = {
  day: string;
  predicted_revenue_eur: number | string;
};

type ForecastChartProps = {
  title: string;
  points: ForecastPoint[];
};

function euro(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function ForecastChart({ title, points }: ForecastChartProps) {
  const data = points.map((point) => ({
    day: point.day,
    revenue: Number(point.predicted_revenue_eur || 0),
  }));

  if (!data.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Aucun point disponible pour le graphique.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-xs text-slate-600">
          Projection du chiffre d’affaires prédit sur l’horizon sélectionné.
        </p>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" tick={{ fontSize: 12 }} />
            <YAxis
              tick={{ fontSize: 12 }}
              tickFormatter={(value: number) => euro(value)}
              width={90}
            />
            <Tooltip
              formatter={(value: number) => [euro(Number(value)), "Forecast"]}
              labelFormatter={(label: string) => `Date : ${label}`}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="revenue"
              name="Forecast"
              stroke="#2563eb"
              strokeWidth={2}
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}