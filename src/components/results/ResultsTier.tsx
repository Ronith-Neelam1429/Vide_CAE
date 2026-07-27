import { useState, type ReactNode } from "react";
import type { SafetyBudget } from "../../lib/resultMetrics";

export function SafetyBudgetBar({ budget }: { budget: SafetyBudget }) {
  const state =
    budget.usedPercent >= 100
      ? "is-exceeded"
      : budget.usedPercent >= 75
        ? "is-high"
        : budget.usedPercent >= 40
          ? "is-moderate"
          : "is-low";

  return (
    <div className={`safety-budget ${state}`}>
      <div className="safety-budget__header">
        <span>Safety budget used</span>
        <strong>{budget.usedPercent.toFixed(0)}%</strong>
      </div>
      <div
        className="safety-budget__track"
        role="progressbar"
        aria-label={budget.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.round(budget.usedPercent))}
      >
        <span style={{ width: `${budget.displayPercent}%` }} />
      </div>
      <small>{budget.label}</small>
    </div>
  );
}

export function StoryMetrics({
  children,
  label = "Key results",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <section className="story-metrics" aria-label={label}>
      <div className="result-tier-label">{label}</div>
      <div className="story-metrics__grid">{children}</div>
    </section>
  );
}

export function StoryMetric({
  label,
  value,
  unit,
  note,
  primary = false,
}: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  primary?: boolean;
}) {
  return (
    <div className={`story-metric${primary ? " is-primary" : ""}`}>
      <span>{label}</span>
      <strong>
        {value}
        {unit && <em> {unit}</em>}
      </strong>
      {note && <small>{note}</small>}
    </div>
  );
}

export function DeepDive({
  children,
  hint,
}: {
  children: ReactNode;
  hint: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className={`result-section deep-dive${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="result-section__toggle deep-dive__toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={`result-section__chevron${open ? " is-open" : ""}`}>›</span>
        <span className="result-section__title">Deep dive</span>
        <span className="deep-dive__hint">{hint}</span>
      </button>
      {open && <div className="result-section__body deep-dive__body">{children}</div>}
    </section>
  );
}
