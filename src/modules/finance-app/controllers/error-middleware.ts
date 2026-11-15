import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodIssue } from "zod";
import { AppError } from "../../../shared/errors/app-error";

function validationMessage(issue: ZodIssue): string {
  const field = issue.path.join(".");
  if (field.length === 0) return issue.message;
  if (issue.message === "Required") return `${field} is required`;
  if (issue.message.startsWith(`${field} `)) return issue.message;
  return `${field}: ${issue.message}`;
}

export function errorMiddleware(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
) {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: "validation_error",
        message: error.issues.map(validationMessage).join("; "),
      },
    });
    return;
  }

  if (error instanceof SyntaxError) {
    response.status(400).json({
      error: { code: "validation_error", message: "Request body must be valid JSON" },
    });
    return;
  }

  if (error instanceof AppError) {
    const status =
      error.code === "not_found" ? 404 : error.code === "conflict" ? 409 : 400;
    response.status(status).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  response.status(500).json({
    error: { code: "internal_error", message: "Internal error" },
  });
}
