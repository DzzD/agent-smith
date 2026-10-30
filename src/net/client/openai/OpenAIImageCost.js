/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
export function getGptImage2Cost(usage)
{
  const textInputTokens = Number(usage?.input_tokens_details?.text_tokens ?? 0);
  const imageInputTokens = Number(usage?.input_tokens_details?.image_tokens ?? 0);
  const imageOutputTokens = Number(usage?.output_tokens_details?.image_tokens ?? 0);

  return (textInputTokens * 5 + imageInputTokens * 8 + imageOutputTokens * 30) / 1_000_000;
}
