export class AppError extends Error {
  constructor(
    readonly code: "validation_error" | "not_found" | "conflict",
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super("validation_error", message);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super("not_found", message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("conflict", message);
  }
}
