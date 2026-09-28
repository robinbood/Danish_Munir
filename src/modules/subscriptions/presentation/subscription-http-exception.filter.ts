import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  ConcurrentSubscriptionModificationError,
  InvalidBillingCycleError,
  InsufficientQuotaError,
  InvalidBillingPeriodError,
  InvalidSubscriptionPlanError,
  InvalidSubscriptionRequestError,
  InvalidSubscriptionTransitionError,
  PaymentFailedError,
  SubscriptionNotFoundError,
} from '../domain/subscription.errors.ts';

@Catch(Error)
export class SubscriptionHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();

    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    const status =
      exception instanceof SubscriptionNotFoundError
        ? HttpStatus.NOT_FOUND
        : exception instanceof InvalidSubscriptionPlanError ||
            exception instanceof InvalidBillingCycleError ||
            exception instanceof InvalidSubscriptionRequestError
          ? HttpStatus.BAD_REQUEST
          : exception instanceof InsufficientQuotaError
            ? HttpStatus.TOO_MANY_REQUESTS
            : exception instanceof PaymentFailedError
              ? HttpStatus.PAYMENT_REQUIRED
              : exception instanceof ConcurrentSubscriptionModificationError
                ? HttpStatus.CONFLICT
                : exception instanceof InvalidSubscriptionTransitionError ||
                    exception instanceof InvalidBillingPeriodError
                  ? HttpStatus.UNPROCESSABLE_ENTITY
                  : HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(status).json({
      statusCode: status,
      message:
        exception instanceof Error
          ? exception.message
          : 'Internal server error',
      error:
        status === HttpStatus.INTERNAL_SERVER_ERROR
          ? 'Internal Server Error'
          : 'Request Failed',
    });
  }
}
