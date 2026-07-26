import { invoke } from "@tauri-apps/api/core";
import type { StimulusOptions, StimulusParameters } from "./stimuli";

export type AssistSource = "azure" | "rules";

export type AssistConfigStatus = {
  configured: boolean;
  provider: string;
  deployment: string | null;
  endpointHost: string | null;
  message: string;
};

export type ProtocolSuggestion = {
  caseId: string | null;
  label: string;
  citation: string;
  confidence: string;
  reason: string;
  availability: string;
  availabilityNote: string;
  parameters: StimulusParameters;
  options: StimulusOptions;
  unknowns: string[];
  warnings: string[];
  source: AssistSource;
};

export type ExtractProtocolResponse = {
  source: AssistSource;
  draftManifest: Record<string, unknown> | null;
  missingFields: string[];
  unknowns: string[];
  warnings: string[];
  confidence: string;
  extractionNotes: string;
};

export async function fetchAssistStatus(): Promise<AssistConfigStatus> {
  return invoke<AssistConfigStatus>("assist_status");
}

export async function suggestProtocolWithAssist(
  text: string,
  preferAzure = true,
): Promise<ProtocolSuggestion | null> {
  return invoke<ProtocolSuggestion | null>("assist_suggest_protocol", {
    request: { text, preferAzure },
  });
}

export async function extractProtocolWithAssist(
  text: string,
  preferAzure = true,
): Promise<ExtractProtocolResponse> {
  return invoke<ExtractProtocolResponse>("assist_extract_protocol", {
    request: { text, preferAzure },
  });
}
