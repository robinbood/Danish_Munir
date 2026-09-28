export class ChatQuotaExceededError extends Error {
  constructor(message = 'Chat quota exceeded.') {
    super(message);
    this.name = 'ChatQuotaExceededError';
  }
}

export class InvalidChatQuestionError extends Error {
  constructor(message = 'Question is invalid.') {
    super(message);
    this.name = 'InvalidChatQuestionError';
  }
}

export class InvalidChatRequestError extends Error {
  constructor(message = 'A userId and question are required.') {
    super(message);
    this.name = 'InvalidChatRequestError';
  }
}

/** The monthly free allowance is spent and no paid bundle could serve the request. */
export class FreeQuotaExceededError extends ChatQuotaExceededError {
  constructor(
    message = 'The free monthly quota is exhausted and no active bundle has capacity.',
  ) {
    super(message);
    this.name = 'FreeQuotaExceededError';
  }
}

/** Bundles exist for this user but every one of them is drained for the period. */
export class InsufficientPaidQuotaError extends ChatQuotaExceededError {
  constructor(message = 'No active paid bundle has any messages left.') {
    super(message);
    this.name = 'InsufficientPaidQuotaError';
  }
}
