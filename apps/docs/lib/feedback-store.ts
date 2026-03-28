import "server-only";

import type { DocsFeedbackValue as DocsFeedbackInputValue } from "@farming-labs/docs";
import { DocsFeedbackValue } from "@prisma/client";
import { prisma } from "./prisma";

type SaveDocsFeedbackContext = {
  userAgent?: string | null;
};

type NormalizedDocsFeedback = {
  value: DocsFeedbackInputValue;
  comment: string | null;
  title: string | null;
  description: string | null;
  url: string;
  pathname: string;
  path: string;
  entry: string;
  slug: string;
  locale: string | null;
};

const FEEDBACK_VALUES = new Set<DocsFeedbackInputValue>(["positive", "negative"]);

export class DocsFeedbackValidationError extends Error {
  name = "DocsFeedbackValidationError";
}

function normalizeOptionalString(
  record: Record<string, unknown>,
  field: string,
  maxLength: number,
) {
  const value = record[field];

  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new DocsFeedbackValidationError(`${field} must be a string.`);
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

function normalizeRequiredString(
  record: Record<string, unknown>,
  field: string,
  maxLength: number,
) {
  const value = normalizeOptionalString(record, field, maxLength);

  if (!value) {
    throw new DocsFeedbackValidationError(`${field} is required.`);
  }

  return value;
}

function normalizeDocsFeedback(data: unknown): NormalizedDocsFeedback {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new DocsFeedbackValidationError("Feedback payload must be a JSON object.");
  }

  const record = data as Record<string, unknown>;
  const value = record.value;

  if (typeof value !== "string" || !FEEDBACK_VALUES.has(value as DocsFeedbackInputValue)) {
    throw new DocsFeedbackValidationError(
      "value must be either \"positive\" or \"negative\".",
    );
  }

  const pathname = normalizeRequiredString(record, "pathname", 1024);

  return {
    value: value as DocsFeedbackInputValue,
    comment: normalizeOptionalString(record, "comment", 4000),
    title: normalizeOptionalString(record, "title", 512),
    description: normalizeOptionalString(record, "description", 2048),
    url: normalizeRequiredString(record, "url", 4096),
    pathname,
    path: normalizeOptionalString(record, "path", 1024) ?? pathname,
    entry: normalizeRequiredString(record, "entry", 128),
    slug: normalizeRequiredString(record, "slug", 1024),
    locale: normalizeOptionalString(record, "locale", 32),
  };
}

export async function saveDocsFeedback(
  data: unknown,
  context: SaveDocsFeedbackContext = {},
) {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is not configured for docs feedback storage.");
  }

  const feedback = normalizeDocsFeedback(data);
  const userAgent =
    typeof context.userAgent === "string" && context.userAgent.trim()
      ? context.userAgent.trim().slice(0, 1024)
      : null;

  await prisma.ormFeedback.create({
    data: {
      value: feedback.value as DocsFeedbackValue,
      comment: feedback.comment,
      title: feedback.title,
      description: feedback.description,
      url: feedback.url,
      pathname: feedback.pathname,
      path: feedback.path,
      entry: feedback.entry,
      slug: feedback.slug,
      locale: feedback.locale,
      userAgent,
    },
  });
}
