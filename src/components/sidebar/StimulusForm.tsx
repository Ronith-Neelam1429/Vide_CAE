import { useState } from "react";
import type { ModelCatalog } from "../../lib/simulation";
import {
  BUILTIN_STIMULI,
  FIELD_GROUP_LABELS,
  getStimulusDefinition,
  STIMULUS_PRESETS,
  visibleFields,
  type CatalogSource,
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

/** Options for a choice field, taken from the backend catalog where relevant. */
function optionsFor(
  field: StimulusChoiceField,
  catalog: ModelCatalog | null,
): Array<{ value: string; label: string }> {
  if (field.choices) return field.choices;
  if (!field.catalog || !catalog) return [];

  const table: Record<CatalogSource, Array<{ id: string; label: string }>> = {
    skinProfiles: catalog.skinProfiles,
    deviceMaterials: catalog.deviceMaterials,
    interfaceMaterials: catalog.interfaceMaterials,
    damageModels: catalog.damageModels,
  };

  return table[field.catalog].map((entry) => ({
    value: entry.id,
    label: entry.label,
  }));
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
  onChange,
}: {
  field: StimulusChoiceField;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (next: string) => void;
}) {
  return (
    <label className="stimulus-form__field">
      <span className="stimulus-form__label">{field.label}</span>
      <select
        className="stimulus-form__select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.length === 0 && <option value={value}>{value}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
  const copyStimulusToAll = useExperimentStore((s) => s.copyStimulusToAll);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    essential: true,
    contact: true,
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

    return (
      <ChoiceInput
        key={field.key}
        field={field}
        value={assignment.options[field.key] ?? field.defaultValue}
        options={optionsFor(field, catalog)}
        onChange={(next) => setStimulusOption(contactPointId, field.key, next)}
      />
    );
  };

  return (
    <div className="stimulus-form">
      <label className="stimulus-form__field">
        <span className="stimulus-form__label">Start from a scenario</span>
        <select
          className="stimulus-form__select"
          value=""
          onChange={(event) => {
            if (event.target.value) applyPreset(contactPointId, event.target.value);
          }}
        >
          <option value="">Choose a preset…</option>
          {STIMULUS_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
        <span className="stimulus-form__help">
          Fills every field below with a consistent set of conditions you can then adjust.
        </span>
      </label>

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
