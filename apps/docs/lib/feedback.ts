"use server";

import type { DocsFeedbackData } from "@farming-labs/docs";
import { saveDocsFeedback } from "./feedback-store";

export async function submitDocsFeedback(data: DocsFeedbackData) {
  await saveDocsFeedback(data);
}
