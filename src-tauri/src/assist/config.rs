use serde::Serialize;

const ENV_ENDPOINT: &str = "VIDE_AZURE_OPENAI_ENDPOINT";
const ENV_API_KEY: &str = "VIDE_AZURE_OPENAI_API_KEY";
const ENV_DEPLOYMENT: &str = "VIDE_AZURE_OPENAI_DEPLOYMENT";

#[derive(Debug, Clone)]
pub struct AzureOpenAiConfig {
    pub endpoint: String,
    pub api_key: String,
    pub deployment: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistConfigStatus {
    pub configured: bool,
    pub provider: &'static str,
    pub deployment: Option<String>,
    pub endpoint_host: Option<String>,
    pub message: String,
}

pub fn load_azure_config() -> Option<AzureOpenAiConfig> {
    let endpoint = std::env::var(ENV_ENDPOINT).ok()?.trim().trim_end_matches('/').to_string();
    let api_key = std::env::var(ENV_API_KEY).ok()?.trim().to_string();
    let deployment = std::env::var(ENV_DEPLOYMENT).ok()?.trim().to_string();

    if endpoint.is_empty() || api_key.is_empty() || deployment.is_empty() {
        return None;
    }

    Some(AzureOpenAiConfig {
        endpoint,
        api_key,
        deployment,
    })
}

pub fn assist_config_status() -> AssistConfigStatus {
    match load_azure_config() {
        Some(config) => {
            let host = config
                .endpoint
                .trim_start_matches("https://")
                .trim_start_matches("http://")
                .split('/')
                .next()
                .map(str::to_string);

            AssistConfigStatus {
                configured: true,
                provider: "azure-openai",
                deployment: Some(config.deployment),
                endpoint_host: host,
                message: "Azure OpenAI / Foundry assist is configured. Protocol suggestions use structured LLM output with physics fallback.".to_string(),
            }
        }
        None => AssistConfigStatus {
            configured: false,
            provider: "rules-only",
            deployment: None,
            endpoint_host: None,
            message: format!(
                "Assist is running in rules-only mode. Set {ENV_ENDPOINT}, {ENV_API_KEY}, and {ENV_DEPLOYMENT} to enable Azure Foundry."
            ),
        },
    }
}
