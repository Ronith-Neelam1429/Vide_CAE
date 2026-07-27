import { useMemo, useState } from "react";
import type { ProtocolSuggestion } from "../../lib/assist";
import { listLiteratureCases } from "../../lib/literatureCases";
import type { ModelCatalog, SensitivityEntry } from "../../lib/simulation";
import {
  impactHintForField,
  sortFieldsByImpact,
} from "../../lib/sensitivityHints";
import {
  BUILTIN_STIMULI,
  getStimulusDefinition,
  STIMULUS_PRESETS,
  visibleFields,
  type StimulusChoiceField,
  type StimulusField,
  type StimulusNumberField,
  type StimulusType,
} from "../../lib/stimuli";
import { useExperimentStore } from "../../store/experimentStore";

type StimulusFormProps = {
  contactPointId: string;
};

type Option = { value: string; label: string; group?: string };

/** Always-visible heat fields for a runnable experiment. */
function formatConductivity(value: number): string {
  return `${value} W/m·K`;
}

function optionsFor(
  field: StimulusChoiceField,
  catalog: ModelCatalog | null,
): Option[] {
  if (field.choices) return field.choices;
  if (!field.catalog || !catalog) return [];

  switch (field.catalog) {
    case "skinProfiles":
      return catalog.skinProfiles.map((entry) => ({
        value: entry.id,
        label: entry.label,
        group: entry.category,
      }));
    case "deviceMaterials":
      return catalog.deviceMaterials.map((entry) => ({
        value: entry.id,
        label: `${entry.label} · ${formatConductivity(entry.conductivityWPerMK)}`,
      }));
    case "interfaceMaterials":
      return catalog.interfaceMaterials.map((entry) => ({
        value: entry.id,
        label: `${entry.label} · ${formatConductivity(entry.conductivityWPerMK)}`,
      }));
    case "damageModels":
      return catalog.damageModels.map((entry) => ({
        value: entry.id,
        label: entry.label,
      }));
  }
}

function describeOption(
  field: StimulusChoiceField,
  value: string,
  catalog: ModelCatalog | null,
): string | null {
  if (!field.catalog || !catalog) return null;

  switch (field.catalog) {
    case "skinProfiles": {
      const entry = catalog.skinProfiles.find((e) => e.id === value);
      return entry ? entry.description : null;
    }
    case "deviceMaterials": {
      const entry = catalog.deviceMaterials.find((e) => e.id === value);
      return entry ? entry.source : null;
    }
    case "interfaceMaterials": {
      const entry = catalog.interfaceMaterials.find((e) => e.id === value);
      return entry
        ? `${formatConductivity(entry.conductivityWPerMK)}${
            entry.pressureDependent ? ", pressure-dependent" : ""
          }. ${entry.source}`
        : null;
    }
    case "damageModels": {
      const entry = catalog.damageModels.find((e) => e.id === value);
      return entry ? entry.citation : null;
    }
  }
}

function ImpactTag({ hint }: { hint: { impact: string; label: string } | null }) {
  if (!hint) return null;
  return (
    <span className={`stimulus-form__impact is-${hint.impact}`} title={hint.label}>
      {hint.label}
    </span>
  );
}

function NumberInput({
  field,
  value,
  onChange,
  impact,
}: {
  field: StimulusNumberField;
  value: number;
  onChange: (next: number) => void;
  impact?: { impact: string; label: string } | null;
}) {
  return (
    <label className="stimulus-form__field">
      <span className="stimulus-form__label">
        {field.label}
        <span className="stimulus-form__unit">{field.unit}</span>
        <ImpactTag hint={impact ?? null} />
      </span>
      <input
        className="stimulus-form__input"
        type="number"
        min={field.min}
        max={field.max}
        step={field.step}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
      {field.help && <span className="stimulus-form__help">{field.help}</span>}
    </label>
  );
}

function ChoiceInput({
  field,
  value,
  options,
  description,
  onChange,
  impact,
}: {
  field: StimulusChoiceField;
  value: string;
  options: Option[];
  description: string | null;
  onChange: (next: string) => void;
  impact?: { impact: string; label: string } | null;
}) {
  const groups = options.reduce<string[]>((acc, option) => {
    const group = option.group ?? "";
    if (!acc.includes(group)) acc.push(group);
    return acc;
  }, []);
  const useGroups = groups.length > 1 || (groups.length === 1 && groups[0] !== "");

  return (
    <label className="stimulus-form__field">
      <span className="stimulus-form__label">
        {field.label}
        <ImpactTag hint={impact ?? null} />
      </span>
      <select
        className="stimulus-form__select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.length === 0 && <option value={value}>{value}</option>}
        {useGroups
          ? groups.map((group) => (
              <optgroup key={group || "other"} label={group || "Other"}>
                {options
                  .filter((option) => (option.group ?? "") === group)
                  .map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
              </optgroup>
            ))
          : options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
      </select>
      {description && (
        <span className="stimulus-form__option-desc">{description}</span>
      )}
      {field.help && <span className="stimulus-form__help">{field.help}</span>}
    </label>
  );
}

function HeatTimelinePreview({
  parameters,
}: {
  parameters: Record<string, number>;
}) {
  const hold = parameters.timelineHoldS ?? 10;
  const ramp = parameters.timelineRampS ?? 5;
  const release = parameters.timelineReleaseS ?? 10;
  const repeats = Math.max(1, Math.round(parameters.timelineRepeats ?? 1));
  const start = parameters.temperatureC ?? 44;
  const target = parameters.timelineRampTargetC ?? 46;
  const total = (hold + ramp + release) * repeats;
  return (
    <div className="timeline-editor" aria-label="Thermal protocol waveform summary">
      <div className="timeline-editor__wave">
        <span style={{ flex: Math.max(hold, 1) }}>
          Hold {start.toFixed(1)} °C · {hold}s
        </span>
        <span className="is-ramp" style={{ flex: Math.max(ramp, 1) }}>
          Ramp → {target.toFixed(1)} °C · {ramp}s
        </span>
        <span className="is-release" style={{ flex: Math.max(release, 1) }}>
          Release · {release}s
        </span>
      </div>
      <small>
        Repeat {repeats}× · active protocol {total.toFixed(0)} s · damage and CEM43
        accumulate continuously
      </small>
    </div>
  );
}

export function StimulusForm({ contactPointId }: StimulusFormProps) {
  const assignment = useExperimentStore((s) =>
    s.assignments.find((a) => a.contactPointId === contactPointId),
  );
  const catalog = useExperimentStore((s) => s.catalog);
  const contactCount = useExperimentStore((s) => s.contactPoints.length);
  const setStimulusType = useExperimentStore((s) => s.setStimulusType);
  const setStimulusParameter = useExperimentStore((s) => s.setStimulusParameter);
  const setStimulusOption = useExperimentStore((s) => s.setStimulusOption);
  const applyPreset = useExperimentStore((s) => s.applyPreset);
  const applyLiteratureCase = useExperimentStore((s) => s.applyLiteratureCase);
  const applyProtocolSuggestion = useExperimentStore((s) => s.applyProtocolSuggestion);
  const suggestProtocolFromText = useExperimentStore((s) => s.suggestProtocolFromText);
  const assistStatus = useExperimentStore((s) => s.assistStatus);
  const copyStimulusToAll = useExperimentStore((s) => s.copyStimulusToAll);
  const advancedOpen = useExperimentStore((s) => s.stimulusAdvancedOpen);
  const setAdvancedOpen = useExperimentStore((s) => s.setStimulusAdvancedOpen);
  const simulationResult = useExperimentStore((s) => s.simulationResult);

  const [protocolQuery, setProtocolQuery] = useState("");
  const [protocolSuggestion, setProtocolSuggestion] =
    useState<ProtocolSuggestion | null>(null);
  const [protocolSearching, setProtocolSearching] = useState(false);
  const [activePresetId, setActivePresetId] = useState("");

  const sensitivity: SensitivityEntry[] = useMemo(() => {
    const contact = simulationResult?.contacts.find(
      (entry) => entry.contactPointId === contactPointId,
    );
    return contact?.sensitivity ?? [];
  }, [simulationResult, contactPointId]);

  if (!assignment) {
    return <div className="stimulus-form__empty">No stimulus assigned yet.</div>;
  }

  const definition = getStimulusDefinition(assignment.stimulusType);
  const fields = definition
    ? visibleFields(definition, assignment.parameters, assignment.options)
    : [];

  const cyclic = assignment.options.loadingMode === "cyclic";
  const electricalDrive = assignment.options.electricalDriveMode ?? "current";
  const electricalWaveform = assignment.options.waveformType ?? "pulsed";
  const heatTimeline = assignment.options.protocolMode === "timeline";
  const pressurePrimaryKeys = new Set(
    cyclic
      ? [
          "loadingMode",
          "skinProfileId",
          "appliedPressureKpa",
          "waveformShape",
          "frequencyHz",
          "dutyCycle",
          "cycles",
        ]
      : [
          "loadingMode",
          "skinProfileId",
          "appliedPressureKpa",
          "holdDurationS",
          "recoveryS",
        ],
  );
  const electricalPrimaryKeys = new Set([
    "skinProfileId",
    "waveformType",
    "electricalDriveMode",
    electricalDrive === "voltage" ? "voltageV" : "currentMa",
    ...(electricalWaveform === "pulsed" ? ["pulseDurationUs"] : ["frequencyHz"]),
    "contactAreaMm2",
    "durationS",
  ]);
  const heatPrimaryKeys = new Set([
    "protocolMode",
    "skinProfileId",
    "temperatureC",
    ...(heatTimeline
      ? [
          "timelineHoldS",
          "timelineRampTargetC",
          "timelineRampS",
          "timelineReleaseS",
          "timelineRepeats",
        ]
      : ["durationS"]),
    "contactAreaMm2",
  ]);
  const primaryKeys =
    assignment.stimulusType === "pressure"
      ? pressurePrimaryKeys
      : assignment.stimulusType === "electrical"
        ? electricalPrimaryKeys
        : heatPrimaryKeys;
  const primaryFields = fields.filter((field) => primaryKeys.has(field.key));
  const primaryOrder =
    assignment.stimulusType === "pressure"
      ? cyclic
        ? [
            "loadingMode",
            "skinProfileId",
            "appliedPressureKpa",
            "waveformShape",
            "frequencyHz",
            "dutyCycle",
            "cycles",
          ]
        : [
            "loadingMode",
            "skinProfileId",
            "appliedPressureKpa",
            "holdDurationS",
            "recoveryS",
          ]
      : assignment.stimulusType === "electrical"
        ? [
            "skinProfileId",
            "waveformType",
            "electricalDriveMode",
            electricalDrive === "voltage" ? "voltageV" : "currentMa",
            electricalWaveform === "pulsed" ? "pulseDurationUs" : "frequencyHz",
            "contactAreaMm2",
            "durationS",
          ]
        : heatTimeline
          ? [
              "protocolMode",
              "skinProfileId",
              "temperatureC",
              "timelineHoldS",
              "timelineRampTargetC",
              "timelineRampS",
              "timelineReleaseS",
              "timelineRepeats",
              "contactAreaMm2",
            ]
          : [
              "protocolMode",
              "skinProfileId",
              "temperatureC",
              "durationS",
              "contactAreaMm2",
            ];
  primaryFields.sort(
    (a, b) => primaryOrder.indexOf(a.key) - primaryOrder.indexOf(b.key),
  );

  const advancedFields = sortFieldsByImpact(
    fields.filter((field) => !primaryKeys.has(field.key)),
    sensitivity,
  );

  const renderField = (field: StimulusField, withImpact: boolean) => {
    const impact = withImpact ? impactHintForField(field.key, sensitivity) : null;
    if (field.kind === "number") {
      return (
        <NumberInput
          key={field.key}
          field={field}
          value={assignment.parameters[field.key] ?? field.defaultValue}
          onChange={(next) => setStimulusParameter(contactPointId, field.key, next)}
          impact={impact}
        />
      );
    }

    const currentValue = assignment.options[field.key] ?? field.defaultValue;
    return (
      <ChoiceInput
        key={field.key}
        field={field}
        value={currentValue}
        options={optionsFor(field, catalog)}
        description={describeOption(field, currentValue, catalog)}
        onChange={(next) => setStimulusOption(contactPointId, field.key, next)}
        impact={impact}
      />
    );
  };

  const literatureCases = listLiteratureCases();
  const activeLiteratureCase = assignment.literatureCaseId
    ? literatureCases.find((entry) => entry.id === assignment.literatureCaseId)
    : undefined;

  return (
    <div className="stimulus-form">
      <label className="stimulus-form__field">
        <span className="stimulus-form__label">Stimulus type</span>
        <select
          className="stimulus-form__select"
          value={assignment.stimulusType}
          onChange={(event) =>
            setStimulusType(contactPointId, event.target.value as StimulusType)
          }
        >
          {BUILTIN_STIMULI.map((stimulus) => (
            <option key={stimulus.type} value={stimulus.type}>
              {stimulus.label}
              {stimulus.implemented ? "" : " (not implemented)"}
            </option>
          ))}
        </select>
      </label>

      <label className="stimulus-form__field stimulus-form__field--preset">
        <span className="stimulus-form__label">Quick fill · Preset scenario</span>
        <select
          className="stimulus-form__select"
          value={activePresetId}
          onChange={(event) => {
            const id = event.target.value;
            setActivePresetId(id);
            if (id) applyPreset(contactPointId, id);
          }}
        >
          <option value="">Choose a starting scenario…</option>
          {STIMULUS_PRESETS.filter(
            (preset) => preset.stimulusType === assignment.stimulusType,
          ).map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
        <span className="stimulus-form__help">
          One click fills every field below with validated defaults — then press Run.
        </span>
      </label>

      {definition && !definition.implemented && (
        <div className="stimulus-form__notice">{definition.description}</div>
      )}

      <div className="stimulus-form__primary">{primaryFields.map((f) => renderField(f, false))}</div>
      {assignment.stimulusType === "heat" && heatTimeline && (
        <HeatTimelinePreview parameters={assignment.parameters} />
      )}

      {advancedFields.length > 0 && (
        <section className="stimulus-advanced">
          <button
            type="button"
            className="stimulus-advanced__toggle"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen(!advancedOpen)}
          >
            <span className={`result-section__chevron${advancedOpen ? " is-open" : ""}`}>
              ›
            </span>
            Advanced
            <span className="stimulus-advanced__count">{advancedFields.length}</span>
          </button>
          {advancedOpen && (
            <div className="stimulus-form__params">
              {sensitivity.length > 0 && (
                <p className="stimulus-form__help">
                  Impact tags use the last run’s sensitivity analysis for this contact.
                  Fields are ordered highest impact first.
                </p>
              )}
              {advancedFields.map((field) => renderField(field, true))}

              <details className="stimulus-form__advanced">
                <summary>
                  Match a published study
                  {assistStatus?.configured ? " · Azure ready" : ""}
                  {activeLiteratureCase ? ` · ${activeLiteratureCase.label}` : ""}
                </summary>
                <select
                  className="stimulus-form__select"
                  value={assignment.literatureCaseId ?? ""}
                  onChange={(event) => {
                    if (event.target.value) {
                      applyLiteratureCase(contactPointId, event.target.value);
                    }
                  }}
                >
                  <option value="">Published case…</option>
                  {literatureCases.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
                <input
                  className="stimulus-form__input"
                  type="text"
                  placeholder="Describe protocol, then press Enter"
                  value={protocolQuery}
                  onChange={(event) => setProtocolQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || protocolSearching) return;
                    event.preventDefault();
                    void (async () => {
                      setProtocolSearching(true);
                      try {
                        const suggestion = await suggestProtocolFromText(
                          contactPointId,
                          protocolQuery,
                        );
                        setProtocolSuggestion(suggestion);
                      } finally {
                        setProtocolSearching(false);
                      }
                    })();
                  }}
                />
                {protocolSuggestion && (
                  <div className="stimulus-form__literature-suggestion">
                    <strong>{protocolSuggestion.label}</strong>
                    <span>
                      {protocolSuggestion.confidence} · {protocolSuggestion.source}
                    </span>
                    {protocolSuggestion.confidence !== "high" && (
                      <button
                        type="button"
                        className="sidebar__btn sidebar__btn--compact"
                        onClick={() => {
                          applyProtocolSuggestion(contactPointId, protocolSuggestion);
                          setProtocolSuggestion(null);
                        }}
                      >
                        Apply
                      </button>
                    )}
                  </div>
                )}
              </details>
            </div>
          )}
        </section>
      )}

      {contactCount > 1 && (
        <button
          type="button"
          className="sidebar__btn"
          onClick={() => copyStimulusToAll(contactPointId)}
        >
          Apply this setup to all {contactCount} contacts
        </button>
      )}
    </div>
  );
}
