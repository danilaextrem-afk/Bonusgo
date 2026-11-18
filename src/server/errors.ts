/** Typed application errors. `message` is safe to show to end users (Russian UI). */
export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
    this.name = "AppError";
  }
}

export class LimitError extends AppError {
  constructor(message: string, public limit?: string) {
    super("PLAN_LIMIT", message, 402);
    this.name = "LimitError";
  }
}

export class AuthError extends AppError {
  constructor(code = "UNAUTHORIZED", message = "Неверный email или пароль.") {
    super(code, message, 401);
    this.name = "AuthError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Недостаточно прав.") {
    super("FORBIDDEN", message, 403);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Не найдено.") {
    super("NOT_FOUND", message, 404);
    this.name = "NotFoundError";
  }
}
