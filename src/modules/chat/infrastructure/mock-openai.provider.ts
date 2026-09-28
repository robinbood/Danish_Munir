import { Injectable } from '@nestjs/common';
import {
  ChatAiProviderPort,
  type ChatCompletion,
} from '../application/ports/chat-ai-provider.port.ts';
import { AI_RESPONSE_LATENCY_MS } from '../../../shared/infrastructure/persistence/tokens.ts';

/** Roughly four characters per token, matching typical OpenAI BPE output. */
const APPROX_CHARS_PER_TOKEN = 4;

@Injectable()
export class MockOpenAiProvider extends ChatAiProviderPort {
  async generateAnswer(question: string): Promise<ChatCompletion> {
    const latencyMs = Number(process.env[AI_RESPONSE_LATENCY_MS] ?? 100);
    if (!Number.isFinite(latencyMs) || latencyMs < 0) {
      throw new RangeError(
        `${AI_RESPONSE_LATENCY_MS} must be a non-negative number.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, latencyMs));

    const answer = `Mocked AI answer for: ${question}`;
    const tokensUsed = Math.max(
      1,
      Math.ceil((question.length + answer.length) / APPROX_CHARS_PER_TOKEN),
    );

    return { answer, tokensUsed };
  }
}
