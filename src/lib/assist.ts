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

export type ProofLabCaseBrief = {
  caseId: string;
  headline: string;
  agreement: "close" | "mixed" | "divergent" | string;
  highlights: string[];
  concerns: string[];
};

export type ProofLabAnalysis = {
  source: AssistSource;
  headline: string;
  summary: string;
  caseBriefs: ProofLabCaseBrief[];
  recommendedReads: string[];
  caveats: string[];
};

/** Compact comparison payload for AI (no full time series). */
export type ProofLabAnalysisPayload = {
  modelVersion: string;
  disclosure: string;
  cases: Array<{
    caseId: string;
    title: string;
    citation: string;
    modality: string;
    measurementNote: string;
    extractedFromPaper: string[];
    unknowns: string[];
    protocolInputs: Record<string, number>;
    paperReferenceInputs: Record<string, number>;
    protocolMatch: {
      matched: boolean;
      mismatches: Array<{
        key: string;
        label: string;
        paper: number;
        yours: number;
      }>;
    };
    experimentMetrics: unknown[];
    windows: Array<{
      label: string;
      sampleCount: number;
      rmseC: number | null | undefined;
      maeC: number | null | undefined;
      signedBiasC: number | null | undefined;
      keyDataPoints: unknown[];
      experimentMetrics: unknown[];
    }>;
  }>;
  crossValidationCases: Array<{
    caseId: string;
    title: string;
    citation: string;
    modality: string;
    status: string;
    rmse: number;
    mae: number;
    signedBias: number;
    keyDataPoints: unknown[];
    experimentMetrics: unknown[];
    caveats: string[];
  }>;
};

export async function analyzeProofLabWithAssist(
  report: ProofLabAnalysisPayload,
  preferAzure = true,
): Promise<ProofLabAnalysis> {
  return invoke<ProofLabAnalysis>("assist_analyze_proof_lab", {
    request: { report, preferAzure },
  });
}
