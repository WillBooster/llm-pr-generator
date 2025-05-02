import type { ReasoningEffort } from './types';

type Message = { content: string; role: 'system' | 'user' | 'assistant' };

const OPENAI_MODEL_PREFIXES = ['gpt-', 'o1', 'o3', 'o4'];

export function getApiUrlAndKey(model: string): { url: string; apiKey: string } {
  let url: string;
  let apiKey: string;
  if (model.startsWith('gemini-')) {
    url = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
    apiKey = process.env.GEMINI_API_KEY || '';
  } else if (OPENAI_MODEL_PREFIXES.some((p) => model.startsWith(p))) {
    url = 'https://api.openai.com/v1/chat/completions';
    apiKey = process.env.OPENAI_API_KEY || '';
  } else {
    throw new Error(`Unknown model: ${model}`);
  }
  return { url, apiKey };
}

export async function callLlmApi(
  url: string,
  apiKey: string,
  model: string,
  messages: Message[],
  reasoningEffort?: ReasoningEffort
): Promise<string> {
  if (!apiKey) {
    throw new Error('API key is not set.');
  }

  const requestBody: Record<string, unknown> = {
    model,
    messages,
  };
  if (reasoningEffort !== undefined) {
    requestBody.reasoning_effort = reasoningEffort;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API error: ${response.statusText} (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  console.log(`${model}:`, JSON.stringify(result, null, 2));
  return result.choices[0].message.content;
}
