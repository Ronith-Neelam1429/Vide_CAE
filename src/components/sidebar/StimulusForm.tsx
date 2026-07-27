import { useState } from "react";
import type { ProtocolSuggestion } from "../../lib/assist";
import { listLiteratureCases } from "../../lib/literatureCases";
import type { ModelCatalog } from "../../lib/simulation";
import {
  BUILTIN_STIMULI,
  FIELD_GROUP_LABELS,
  getStimulusDefinition,
  STIMULUS_PRESETS,
  visibleFields,
  type FieldGroup,
  type StimulusChoiceField,
  type StimulusField,
  type StimulusNumberField,
  type StimulusType,
} from "../../lib/stimuli";
import { useExperimentStore } from "../../store/experimentStore";

type StimulusFormProps = {
  contactPointId: string;
};

const GROUP_ORDER: FieldGroup[] = ["essential", "contact", "device", "environment"];

type Option = { value: string; label: string; group?: string };

function formatConductivity(value: number): string {
  return `${value} W/m·K`;
}

/** Options for a choice field, taken from the backend catalog where relevant. */
function optionsFor(
  field: StimulusChoiceField,
  catalog: ModelCatalog | null,
): Option[] {
  if (field.choices) return field.choices;
  if (!field.catalog || !catalog) return [];

  switch (field.catalog) {
    case "skinProfiles":
      // Group tissues by family so the list of organic materials is scannable.
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

/** One-line explanation of the currently selected catalog option. */
function describeOption(
  field: StimulusChoiceField,
  value: string,
  catalog: ModelCatalog | null,
): string | null {
  if (!field.catalog || !catalog) return null;

  switch (field.catalog) {
    case "skinProfiles": {
      const entry = catalog.skinProfiles.find((e) => e.id === value);
      return entry ? `${entry.site}. ${entry.description}` : null;
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

function NumberInput({
  field,
  value,
  onChange,
}: {
  field: StimulusNumberField;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <label className="stimulus-form__field">
      <span className="stimulus-form__label">
        {field.label}
        <span className="stimulus-form__unit">{field.unit}</span>
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
}: {
  field: StimulusChoiceField;
  value: string;
  options: Option[];
  description: string | null;
  onChange: (next: string) => void;
}) {
  // Preserve first-seen order while collecting the distinct group names.
  const groups = options.reduce<string[]>((acc, option) => {
    const group = option.group ?? "";
    if (!acc.includes(group)) acc.push(group);
    return acc;
  }, []);
  const useGroups = groups.length > 1 || (groups.length === 1 && groups[0] !== "");

  return (
    <label className="stimulus-form__field">
      <span className="stimulus-form__label">{field.label}</span>
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

  const [protocolQuery, setProtocolQuery] = useState("");
  const [protocolSuggestion, setProtocolSuggestion] =
    useState<ProtocolSuggestion | null>(null);
  const [protocolSearching, setProtocolSearching] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    essential: true,
    contact: false,
    device: false,
    environment: false,
  });

  if (!assignment) {
    return <div className="stimulus-form__empty">No stimulus assigned yet.</div>;
  }

  const definition = getStimulusDefinition(assignment.stimulusType);
  const fields = definition
    ? visibleFields(definition, assignment.parameters, assignment.options)
    : [];

  const renderField = (field: StimulusField) => {
    if (field.kind === "number") {
      return (
        <NumberInput
          key={field.key}
          field={field}
          value={assignment.parameters[field.key] ?? field.defaultValue}
          onChange={(next) => setStimulusParameter(contactPointId, field.key, next)}
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

      <label className="stimulus-form__field">
        <span className="stimulus-form__label">Quick fill</span>
        <select
          className="stimulus-form__select"
          value=""
          onChange={(event) => {
            if (event.target.value) applyPreset(contactPointId, event.target.value);
          }}
        >
          <option value="">Preset scenario…</option>
          {STIMULUS_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>

      {definition && !definition.implemented && (
        <div className="stimulus-form__notice">{definition.description}</div>
      )}

      {GROUP_ORDER.map((group) => {
        const groupFields = fields.filter((field) => field.group === group);
        if (groupFields.length === 0) return null;
        const open = openGroups[group] ?? false;

        return (
          <section key={group} className="stimulus-group">
            <button
              type="button"
              className="stimulus-group__toggle"
              aria-expanded={open}
              onClick={() =>
                setOpenGroups((current) => ({ ...current, [group]: !open }))
              }
            >
              <span className={`stimulus-group__chevron${open ? " is-open" : ""}`}>
                ›
              </span>
              {FIELD_GROUP_LABELS[group]}
              <span className="stimulus-group__count">{groupFields.length}</span>
            </button>
            {open && (
              <div className="stimulus-form__params">{groupFields.map(renderField)}</div>
            )}
          </section>
        );
      })}

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
        <p className="stimulus-form__help">
          Optional. Fills temperature, duration, and area from a known paper.
          Your run still uses the contact you placed — this is not the Results graph.
        </p>
      </details>

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
