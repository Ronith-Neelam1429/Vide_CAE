import type { SimulationResult } from "./simulation";

function escapeCsv(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

export function exportSimulationCsv(result: SimulationResult): void {
  const header = [
    "contact_id",
    "contact_label",
    "time_s",
    "surface_temperature_c",
    "basal_temperature_c",
    "arrhenius_damage_omega",
    "risk_classification",
  ];

  const rows = result.contacts.flatMap((contact) =>
    contact.series.map((sample) =>
      [
        contact.contactPointId,
        contact.label,
        sample.timeS,
        sample.surfaceTemperatureC,
        sample.basalTemperatureC,
        sample.damageOmega,
        contact.riskClassification,
      ]
        .map(escapeCsv)
        .join(","),
    ),
  );

  const csv = [header.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = `vide-heat-simulation-${new Date()
    .toISOString()
    .replace(/:/g, "-")}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}
