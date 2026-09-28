import { Body, Controller, Post, UseFilters } from '@nestjs/common';
import { z } from 'zod';
import { AskQuestionUseCase } from '../application/ask-question.use-case.ts';
import { ZodValidationPipe } from '../../../shared/presentation/zod-validation.pipe.ts';
import { ChatHttpExceptionFilter } from './chat-http-exception.filter.ts';

const askQuestionSchema = z.object({
  userId: z.string().trim().min(1, 'userId is required.'),
  question: z.string().trim().min(1, 'question is required.'),
});

export type AskQuestionDto = z.infer<typeof askQuestionSchema>;

@Controller('chat')
@UseFilters(ChatHttpExceptionFilter)
export class ChatController {
  constructor(private readonly askQuestionUseCase: AskQuestionUseCase) {}

  @Post('ask')
  async ask(@Body(new ZodValidationPipe(askQuestionSchema)) dto: AskQuestionDto) {
    return this.askQuestionUseCase.execute(dto);
  }
}
