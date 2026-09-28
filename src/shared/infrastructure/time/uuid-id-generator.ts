import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { IdGenerator } from '../../domain/id-generator.ts';

@Injectable()
export class UuidIdGenerator extends IdGenerator {
  next(): string {
    return randomUUID();
  }
}
