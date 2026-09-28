import { Injectable } from '@nestjs/common';
import { Clock } from '../../domain/clock.ts';

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
