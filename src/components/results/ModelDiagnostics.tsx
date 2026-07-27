import { useState, type ReactNode } from "react";
import type {
  ConvergenceReport,
  HeatContactResult,
  VerificationSuite,
} from "../../lib/simulation";

function formatOmega(value: number) {
  if (value === 0) return "0";
  if (value < 0.001 || value >= 1000) return value.toExponential(2);
  return value.toFixed(3);
}

function Section({
  title,
  tone,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  tone?: "ok" | "warn" | "bad";
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="result-section">
      <button
        type="button"
        className="result-section__toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className={`result-section__chevron${open ? " is-open" : ""}`}>›</span>
        <span className="result-section__title">{title}</span>
        {badge && (
          <span className={`result-badge${tone ? ` is-${tone}` : ""}`}>{badge}</span>
        )}
      </button>
      {open && <div className="result-section__body">{children}</div>}
    </section>
  );
}

function ConvergencePanel({ report }: { report: ConvergenceReport }) {
  return (
    <Section
      title="Mesh and timestep convergence"
      tone={report.converged ? "ok" : "warn"}
      badge={report.converged ? "Converged" : "Not converged"}
    >
      <p className="result-note">{report.note}</p>
      <table className="result-table">
        <thead>
          <tr>
            <th>Quantity</th>
            <th>Change on refinement</th>
            <th>Order</th>
          </tr>
        </thead>
        <tbody>
          {report.metrics.map((metric) => (
            <tr key={metric.name}>
              <td>{metric.name}</td>
              <td className={metric.converged ? "is-ok" : "is-bad"}>
                {(metric.relativeChange * 100).toPrecision(2)} %
              </td>
              <td>
                {metric.observedOrder === null ? "—" : metric.observedOrder.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

export function DiagnosticsStatusRow({ contact }: { contact: HeatContactResult }) {
  const { dimensionality, energy, convergence, sensitivity, warnings } = contact;
  const validity =
    dimensionality.verdict === "1D assumption well satisfied"
      ? "OK"
      : dimensionality.verdict === "1D assumption marginal"
        ? "Marginal"
        : "Weak";
  const validityTone =
    validity === "OK" ? "ok" : validity === "Marginal" ? "warn" : "bad";

  return (
    <div className="diagnostics-status" aria-label="Model trust summary">
      <span className={`diagnostics-status__badge is-${validityTone}`}>
        1D validity: {validity}
      </span>
      <span
        className={`diagnostics-status__badge is-${
          convergence?.converged ? "ok" : convergence ? "warn" : "muted"
        }`}
      >
        Mesh: {convergence ? (convergence.converged ? "Converged" : "Not converged") : "—"}
      </span>
      <span className={`diagnostics-status__badge is-${energy.balanced ? "ok" : "bad"}`}>
        Energy balance: {energy.balanced ? "Closed" : "Unbalanced"}
      </span>
      <span className="diagnostics-status__badge is-muted">
        {sensitivity.length} sensitivity params
      </span>
      <span
        className={`diagnostics-status__badge is-${warnings.length > 0 ? "warn" : "muted"}`}
      >
        {warnings.length} caveat{warnings.length === 1 ? "" : "s"}
      </span>
    </div>
  );
}

export function ModelDiagnostics({
  contact,
  verification,
}: {
  contact: HeatContactResult;
  verification?: VerificationSuite | null;
}) {
  const { dimensionality, energy } = contact;

  return (
    <div className="model-diagnostics">
      <DiagnosticsStatusRow contact={contact} />

      <div className="model-diagnostics__grid">
        <Section
          title="1D validity"
          tone={
            dimensionality.verdict === "1D assumption well satisfied"
              ? "ok"
              : dimensionality.verdict === "1D assumption marginal"
                ? "warn"
                : "bad"
          }
          badge={dimensionality.verdict.replace("1D assumption ", "")}
        >
          <dl className="result-card__grid">
            <div>
              <dt>Contact radius</dt>
              <dd>{dimensionality.contactRadiusMm.toPrecision(3)} mm</dd>
            </div>
            <div>
              <dt>Penetration depth</dt>
              <dd>{dimensionality.penetrationDepthMm.toPrecision(3)} mm</dd>
            </div>
            <div>
              <dt>Fourier number</dt>
              <dd>{dimensionality.fourierNumber.toPrecision(3)}</dd>
            </div>
            <div>
              <dt>Retained rise</dt>
              <dd>{(dimensionality.spreadingFactor * 100).toFixed(1)} %</dd>
            </div>
          </dl>
          <p className="result-note">{dimensionality.guidance}</p>
        </Section>

        {contact.convergence && <ConvergencePanel report={contact.convergence} />}

        <Section
          title="Energy balance"
          tone={energy.balanced ? "ok" : "bad"}
          badge={energy.balanced ? "Closed" : "Unbalanced"}
        >
          <dl className="result-card__grid">
            <div>
              <dt>In at surface</dt>
              <dd>{energy.surfaceInJPerM2.toPrecision(4)} J/m²</dd>
            </div>
            <div>
              <dt>Stored in tissue</dt>
              <dd>{energy.storedJPerM2.toPrecision(4)} J/m²</dd>
            </div>
            <div>
              <dt>Removed by perfusion</dt>
              <dd>{energy.perfusionOutJPerM2.toPrecision(4)} J/m²</dd>
            </div>
            <div>
              <dt>Out at deep boundary</dt>
              <dd>{energy.coreOutJPerM2.toPrecision(4)} J/m²</dd>
            </div>
            <div>
              <dt>Metabolic input</dt>
              <dd>{energy.metabolicInJPerM2.toPrecision(4)} J/m²</dd>
            </div>
            <div>
              <dt>Relative residual</dt>
              <dd>{energy.relativeResidual.toExponential(2)}</dd>
            </div>
          </dl>
        </Section>

        {contact.sensitivity.length > 0 && (
          <Section title="Sensitivity" badge={`${contact.sensitivity.length} parameters`}>
            <p className="result-note">
              Each row varies one property across its tabulated range with everything
              else held fixed. Rows are ordered by how much they move the answer.
            </p>
            <table className="result-table">
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th>Range</th>
                  <th>Peak basal span</th>
                </tr>
              </thead>
              <tbody>
                {contact.sensitivity.slice(0, 8).map((entry) => (
                  <tr key={entry.parameter}>
                    <td>{entry.parameter}</td>
                    <td>
                      {entry.low.toPrecision(3)} – {entry.high.toPrecision(3)} {entry.unit}
                    </td>
                    <td>{entry.peakBasalSpanC.toFixed(2)} °C</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {contact.warnings.length > 0 && (
          <Section
            title="Caveats"
            tone="warn"
            badge={String(contact.warnings.length)}
            defaultOpen
          >
            <ul className="result-warnings">
              {contact.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Inputs and provenance">
          <div className="result-provenance">
            <div>
              <strong>{contact.skinProfile.label}</strong>
              <span>{contact.skinProfile.description}</span>
            </div>
            <table className="result-table">
              <thead>
                <tr>
                  <th>Layer</th>
                  <th>Thickness</th>
                  <th>k</th>
                  <th>Perfusion</th>
                </tr>
              </thead>
              <tbody>
                {contact.skinProfile.layers.map((layer) => (
                  <tr key={layer.name}>
                    <td title={layer.thicknessM.source}>{layer.name}</td>
                    <td>{(layer.thicknessM.value * 1000).toPrecision(3)} mm</td>
                    <td>{layer.conductivityWPerMK.value.toPrecision(3)}</td>
                    <td>{layer.perfusionPerS.value.toPrecision(2)} /s</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="result-card__grid">
              <div>
                <dt>Interface</dt>
                <dd>{contact.interfaceMaterial.label}</dd>
              </div>
              <div>
                <dt>Device</dt>
                <dd>{contact.deviceMaterial.label}</dd>
              </div>
              <div>
                <dt>Control</dt>
                <dd>{contact.inputs.deviceControl}</dd>
              </div>
              <div>
                <dt>Solver</dt>
                <dd>
                  {contact.solver.solverDimensionRequested === "auto"
                    ? `Auto → ${contact.solver.solverDimension}`
                    : contact.solver.solverDimension}
                </dd>
              </div>
            </dl>
            <p className="result-note is-dim">{contact.solver.scheme}</p>
            <p className="result-note is-dim">{contact.damageModel.citation}</p>
          </div>
        </Section>

        {verification && (
          <Section
            title="Solver verification"
            tone={verification.passed ? "ok" : "bad"}
            badge={verification.passed ? "All cases pass" : "FAILING"}
          >
            <p className="result-note">{verification.summary}</p>
            <table className="result-table">
              <thead>
                <tr>
                  <th>Case</th>
                  <th>Error</th>
                  <th>Tolerance</th>
                </tr>
              </thead>
              <tbody>
                {verification.cases.map((entry) => (
                  <tr key={entry.id}>
                    <td title={`${entry.description}\n\n${entry.reference}`}>{entry.name}</td>
                    <td className={entry.passed ? "is-ok" : "is-bad"}>
                      {entry.error.toExponential(2)}
                    </td>
                    <td>{entry.tolerance.toExponential(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="result-note is-dim">{verification.scope}</p>
          </Section>
        )}
      </div>

      <p className="result-note is-dim" style={{ marginTop: 8 }}>
        Ω basal = {formatOmega(contact.summary.omegaBasal)} · dermal base ={" "}
        {formatOmega(contact.summary.omegaDermalBase)}
      </p>
    </div>
  );
}
