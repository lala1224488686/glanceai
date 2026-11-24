/**
 * GlanceAI runtime configuration.
 *
 * By default GlanceAI answers questions with a small built-in rule engine
 * (see src/brain.ts). It ships with NO API key and does NOT pretend to be
 * connected to a real LLM.
 *
 * To use a real model, fill in an OpenAI-compatible endpoint below — for
 * example OpenRouter (listed in the AI Assistants & Work track) — with
 * YOUR OWN key, on YOUR OWN build. Never commit a real key to a public
 * repository: the hackathon rules forbid it and anyone can extract it
 * from the packaged app.
 */
export const GLANCEAI_CONFIG = {
  /** e.g. 'https://openrouter.ai/api/v1/chat/completions' — empty = off */
  llmEndpoint: '',
  /** e.g. 'openai/gpt-4o-mini' — only used when llmEndpoint is set */
  llmModel: '',
  /** Your own key for the endpoint above. Keep empty in shared builds. */
  llmApiKey: '',
}
