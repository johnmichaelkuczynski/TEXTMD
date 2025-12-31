import { v4 as uuidv4 } from 'uuid';
import { storage } from './storage';
import type { Request } from 'express';

/**
 * DEV BYPASS HELPER
 * ONLY true in your local Replit workspace — never in production (Render)
 */
export function isDevBypass(_req: Request): boolean {
  const isDev = process.env.REPLIT_DEV_DOMAIN !== undefined;
  console.log('[DEV_BYPASS] REPLIT_DEV_DOMAIN:', process.env.REPLIT_DEV_DOMAIN, 'isDev:', isDev);
  return isDev;
}

/**
 * Truncate: 65% of words OR first 1000 words, whichever is smaller
 */
function truncateText(fullText: string): string {
  const words = fullText.trim().split(/\s+/);
  if (words.length <= 1000) return fullText;

  const sixtyFivePercent = Math.floor(words.length * 0.65);
  const maxWords = Math.min(1000, sixtyFivePercent);

  return words.slice(0, maxWords).join(" ") +
    "\n\n[Upgrade to Pro to see the full output]";
}

export interface OutputResult {
  outputId: string;
  content: string;
  isTruncated: boolean;
  fullWordCount: number;
  previewWordCount: number;
}

/**
 * Store and return output with proper gating.
 * - devBypass or isPro: full output
 * - Otherwise: truncated output
 * - Always saves full text for logged-in users (so they unlock it when they pay later)
 */
export async function storeAndReturnOutput(
  fullText: string,
  outputType: string,
  isPro: boolean,
  userId: number | null,
  devBypass: boolean,
  metadata: Record<string, any> = {}
): Promise<OutputResult> {
  const outputId = uuidv4();
  const canSeeFull = devBypass || isPro;
  const displayText = canSeeFull ? fullText : truncateText(fullText);

  const words = fullText.trim().split(/\s+/);
  const fullWordCount = words.length;
  const previewWordCount = displayText.trim().split(/\s+/).length;

  // Save full + preview to DB
  await storage.createGeneratedOutput({
    outputId,
    outputType,
    outputFull: fullText,
    outputPreview: displayText,
    isTruncated: !canSeeFull,
    userId,
    metadata: metadata || null,
  });

  return {
    outputId,
    content: displayText,
    isTruncated: !canSeeFull,
    fullWordCount,
    previewWordCount,
  };
}

/**
 * Get output with proper authorization.
 */
export async function getFullOutputIfAuthorized(
  outputId: string,
  isPro: boolean,
  userId: number | null,
  devBypass: boolean = false
): Promise<{ content: string; authorized: boolean; outputType: string } | null> {
  const output = await storage.getGeneratedOutput(outputId);
  if (!output) return null;

  // DEV BYPASS or Pro: Return full content
  if (devBypass || isPro) {
    return { 
      content: output.outputFull || output.outputPreview, 
      authorized: true, 
      outputType: output.outputType
    };
  }

  // Check ownership for logged-in users
  if (output.userId !== null && output.userId !== userId) {
    return null;
  }

  // Return preview only
  return { 
    content: output.outputPreview, 
    authorized: false, 
    outputType: output.outputType
  };
}
