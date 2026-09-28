export type ChatCompletion = {
  answer: string;
  tokensUsed: number;
};

export abstract class ChatAiProviderPort {
  abstract generateAnswer(question: string): Promise<ChatCompletion>;
}
