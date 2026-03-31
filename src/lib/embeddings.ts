import OpenAI from 'openai';

import type { AppConfig } from '../config.js';

export type EmbeddingsProvider = {
  modelName: string;
  embedTexts(texts: string[]): Promise<number[][]>;
};

export class OpenAIEmbeddingsProvider implements EmbeddingsProvider {
  readonly modelName: string;
  private readonly client: OpenAI | undefined;

  constructor(config: Pick<AppConfig, 'openAiApiKey' | 'openAiBaseUrl' | 'semanticEmbeddingModel'>) {
    this.modelName = config.semanticEmbeddingModel;
    this.client = config.openAiApiKey
      ? new OpenAI({
          apiKey: config.openAiApiKey,
          baseURL: config.openAiBaseUrl,
        })
      : undefined;
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    if (!this.client) {
      throw new Error('OPENAI_API_KEY is required to build or query the semantic index.');
    }

    const response = await this.client.embeddings.create({
      model: this.modelName,
      input: texts.map((text) => text.trim() || ' '),
    });

    return response.data
      .slice()
      .sort((left, right) => left.index - right.index)
      .map((item) => item.embedding);
  }
}

export async function embedTextBatches(
  provider: EmbeddingsProvider,
  texts: string[],
  batchSize: number,
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const embeddings: number[][] = [];

  for (let index = 0; index < texts.length; index += batchSize) {
    const batch = texts.slice(index, index + batchSize);
    embeddings.push(...(await provider.embedTexts(batch)));
  }

  return embeddings;
}
