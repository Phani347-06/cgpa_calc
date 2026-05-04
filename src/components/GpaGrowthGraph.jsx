import React from 'react';
import {
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const format = (value) => (Number.isFinite(value) ? value.toFixed(2) : '0.00');

export function GpaGrowthGraph({ semesters }) {
  const chartData = semesters
    .map((semester, index) => ({
      name: `Sem ${index + 1}`,
      sgpa: semester.result.credits > 0 ? Number(semester.result.sgpa.toFixed(2)) : null,
      label: semester.label || `Semester ${index + 1}`,
    }))
    .filter((item) => item.sgpa !== null);

  const highest = chartData.reduce((best, item) => (!best || item.sgpa > best.sgpa ? item : best), null);
  const lowest = chartData.reduce((best, item) => (!best || item.sgpa < best.sgpa ? item : best), null);

  return (
    <section className="panel analytics-card graph-card">
      <div className="analytics-heading">
        <div>
          <p className="kicker">GPA growth</p>
          <h2>Semester SGPA graph</h2>
        </div>
        <div className="graph-extremes">
          <span>High {highest ? format(highest.sgpa) : '-'}</span>
          <span>Low {lowest ? format(lowest.sgpa) : '-'}</span>
        </div>
      </div>

      {chartData.length === 0 ? (
        <p className="empty-state">Add SGPA data to see your growth line.</p>
      ) : (
        <div className="chart-shell">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 18, right: 18, bottom: 8, left: -18 }}>
              <CartesianGrid stroke="var(--line)" strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--muted)', fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis
                domain={[0, 10]}
                ticks={[0, 2, 4, 6, 8, 10]}
                tick={{ fill: 'var(--muted)', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  background: 'var(--surface)',
                  color: 'var(--text)',
                }}
                formatter={(value) => [format(value), 'SGPA']}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.label || 'Semester'}
              />
              <Line
                type="monotone"
                dataKey="sgpa"
                stroke="var(--blue)"
                strokeWidth={3}
                dot={{ r: 4, strokeWidth: 2, fill: 'var(--surface)' }}
                activeDot={{ r: 6 }}
              >
                <LabelList dataKey="sgpa" position="top" formatter={format} fill="var(--muted)" fontSize={11} />
              </Line>
              {highest && (
                <ReferenceDot x={highest.name} y={highest.sgpa} r={7} fill="var(--green)" stroke="var(--surface)" />
              )}
              {lowest && (
                <ReferenceDot x={lowest.name} y={lowest.sgpa} r={7} fill="var(--danger)" stroke="var(--surface)" />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
