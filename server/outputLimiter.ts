import { v4 as uuidv4 } from 'uuid';
import { storage } from './storage';
import type { GeneratedOutput } from '@shared/schema';
import type { Request } from 'express';

/**
 * DEV BYPASS HELPER
 * Returns true if we're in a development/preview environment where gating should be bypassed.
 * NEVER returns true for textmd.xyz (production).
 */
export function isDevBypass(req: Request): boolean {
  // Check all possible host headers (for proxies like Render, Cloudflare, etc.)
  const host = req.headers.host || '';
  const xForwardedHost = req.headers['x-forwarded-host'] as string || '';
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  
  // LOG ALL HEADERS FOR DEBUGGING
  console.log('[DEV_BYPASS] Headers:', JSON.stringify({
    host,
    xForwardedHost,
    origin,
    referer,
    NODE_ENV: process.env.NODE_ENV,
    DEV_FULL_ACCESS: process.env.DEV_FULL_ACCESS,
    REPLIT_DEPLOYMENT: process.env.REPLIT_DEPLOYMENT
  }));
  
  // PRODUCTION CHECK 1: Never bypass on production domain
  const isProductionDomain = 
    host.includes('textmd.xyz') || 
    xForwardedHost.includes('textmd.xyz') ||
    origin.includes('textmd.xyz') ||
    referer.includes('textmd.xyz');
  
  // PRODUCTION CHECK 2: Never bypass if NODE_ENV=production (unless DEV_FULL_ACCESS explicitly set)
  const isProductionEnv = process.env.NODE_ENV === 'production';
  
  console.log('[DEV_BYPASS] isProductionDomain:', isProductionDomain, 'isProductionEnv:', isProductionEnv);
  
  // If production domain detected, NEVER bypass
  if (isProductionDomain) {
    console.log('[DEV_BYPASS] Production domain detected, returning false');
    return false;
  }
  
  // If NODE_ENV=production AND no explicit DEV_FULL_ACCESS, NEVER bypass
  if (isProductionEnv && process.env.DEV_FULL_ACCESS !== 'true') {
    console.log('[DEV_BYPASS] NODE_ENV=production without DEV_FULL_ACCESS, returning false');
    return false;
  }
  
  // Check DEV_FULL_ACCESS environment variable (only matters for non-production envs now)
  if (process.env.DEV_FULL_ACCESS === 'true') {
    console.log('[DEV_BYPASS] DEV_FULL_ACCESS=true, returning true');
    return true;
  }
  
  // Bypass in development mode (NODE_ENV not set or not 'production')
  if (process.env.NODE_ENV !== 'production') {
    console.log('[DEV_BYPASS] NODE_ENV not production, returning true');
    return true;
  }
  
  // Bypass if REPLIT_DEPLOYMENT is set (Replit preview/dev deployments)
  if (process.env.REPLIT_DEPLOYMENT) {
    console.log('[DEV_BYPASS] REPLIT_DEPLOYMENT set, returning true');
    return true;
  }
  
  // Bypass if hostname contains replit
  if (host.includes('replit')) {
    console.log('[DEV_BYPASS] Replit host detected, returning true');
    return true;
  }
  
  console.log('[DEV_BYPASS] No bypass conditions met, returning false');
  return false;
}

export function truncateOutput(fullText: string): { preview: string; isTruncated: boolean; actualPreviewWordCount: number } {
  const words = fullText.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  
  // Preview is max(65% of content, 1000 words) - but never more than total
  const limit65Percent = Math.floor(wordCount * 0.65);
  const limit = Math.min(Math.max(limit65Percent, 1000), wordCount);
  
  if (wordCount <= limit) {
    return { preview: fullText, isTruncated: false, actualPreviewWordCount: wordCount };
  }
  
  const previewWords = words.slice(0, limit);
  let previewText = previewWords.join(' ');
  
  // Try to end at a paragraph or sentence boundary
  const lastParagraphBreak = previewText.lastIndexOf('\n\n');
  const lastSentenceEnd = Math.max(
    previewText.lastIndexOf('. '),
    previewText.lastIndexOf('.\n'),
    previewText.lastIndexOf('.')
  );
  
  if (lastParagraphBreak > previewText.length * 0.8) {
    previewText = previewText.substring(0, lastParagraphBreak);
  } else if (lastSentenceEnd > previewText.length * 0.7) {
    previewText = previewText.substring(0, lastSentenceEnd + 1);
  }
  
  const remainingWords = wordCount - previewText.split(/\s+/).filter(w => w.length > 0).length;
  
  const upgradeBanner = `

${'━'.repeat(60)}

                    PREVIEW ENDS HERE
                    
   You're viewing ${Math.round((previewText.split(/\s+/).length / wordCount) * 100)}% of this analysis (${remainingWords}+ words remaining)
   
   UNLOCK FULL ACCESS:
   
   Subscribe to Pro for just $1/month
   
   Pro members get:
   - Complete AI analysis reports  
   - Unlimited text reconstructions
   - Full cognitive evaluations
   - Priority processing

${'━'.repeat(60)}`;

  const preview = previewText + upgradeBanner;
  const actualPreviewWordCount = previewText.split(/\s+/).filter(w => w.length > 0).length;
  
  return { preview, isTruncated: true, actualPreviewWordCount };
}

export interface OutputResult {
  outputId: string;
  content: string;
  isTruncated: boolean;
  fullWordCount: number;
  previewWordCount: number;
  isAnonymous: boolean;
  devBypass: boolean;
}

/**
 * Store and return output with proper gating.
 * 
 * @param fullOutput - The full generated text
 * @param outputType - Type of output (e.g., 'reconstruction', 'objections')
 * @param isPro - Whether the user is a Pro subscriber
 * @param userId - User ID (null for anonymous users)
 * @param devBypass - Whether dev bypass is active (skip all gating)
 * @param metadata - Optional metadata
 */
export async function storeAndReturnOutput(
  fullOutput: string,
  outputType: string,
  isPro: boolean,
  userId: number | null,
  devBypass: boolean = false,
  metadata?: Record<string, any>
): Promise<OutputResult> {
  const outputId = uuidv4();
  const { preview, isTruncated, actualPreviewWordCount } = truncateOutput(fullOutput);
  const fullWords = fullOutput.split(/\s+/).filter(w => w.length > 0);
  const isAnonymous = userId === null;
  
  // DEV BYPASS: Return full output, still store for reference
  if (devBypass) {
    // Store full output even in dev mode (for debugging)
    await storage.createGeneratedOutput({
      outputId,
      outputType,
      outputFull: fullOutput,
      outputPreview: preview,
      isTruncated,
      userId: userId,
      metadata: metadata || null,
    });
    
    return {
      outputId,
      content: fullOutput,
      isTruncated: false,
      fullWordCount: fullWords.length,
      previewWordCount: actualPreviewWordCount,
      isAnonymous,
      devBypass: true,
    };
  }
  
  // ANONYMOUS USER (not logged in): Store preview only, return preview only
  if (isAnonymous) {
    await storage.createGeneratedOutput({
      outputId,
      outputType,
      outputFull: null, // Don't store full output for anonymous users
      outputPreview: preview,
      isTruncated: true, // Always truncated for anonymous
      userId: null,
      metadata: metadata || null,
    });
    
    return {
      outputId,
      content: preview,
      isTruncated: true,
      fullWordCount: fullWords.length,
      previewWordCount: actualPreviewWordCount,
      isAnonymous: true,
      devBypass: false,
    };
  }
  
  // LOGGED IN USER: Store full + preview, return based on is_pro
  await storage.createGeneratedOutput({
    outputId,
    outputType,
    outputFull: fullOutput,
    outputPreview: preview,
    isTruncated,
    userId,
    metadata: metadata || null,
  });
  
  return {
    outputId,
    content: isPro ? fullOutput : preview,
    isTruncated: isPro ? false : isTruncated,
    fullWordCount: fullWords.length,
    previewWordCount: actualPreviewWordCount,
    isAnonymous: false,
    devBypass: false,
  };
}

/**
 * Get output with proper authorization.
 * 
 * @param outputId - The output ID to fetch
 * @param isPro - Whether the requesting user is Pro
 * @param userId - The requesting user's ID (null for anonymous)
 * @param devBypass - Whether dev bypass is active
 */
export async function getFullOutputIfAuthorized(
  outputId: string,
  isPro: boolean,
  userId: number | null,
  devBypass: boolean = false
): Promise<{ content: string; authorized: boolean; outputType: string; isAnonymous: boolean } | null> {
  const output = await storage.getGeneratedOutput(outputId);
  if (!output) return null;
  
  const isAnonymous = output.userId === null;
  
  // DEV BYPASS: Return full content if available
  if (devBypass) {
    return { 
      content: output.outputFull || output.outputPreview, 
      authorized: true, 
      outputType: output.outputType,
      isAnonymous 
    };
  }
  
  // ANONYMOUS OUTPUT: Always return preview only (full is null anyway)
  if (isAnonymous) {
    return { 
      content: output.outputPreview, 
      authorized: false, 
      outputType: output.outputType,
      isAnonymous: true 
    };
  }
  
  // USER-OWNED OUTPUT: Check ownership
  if (output.userId !== userId) {
    return null; // Not authorized to view this output
  }
  
  // Return full if Pro, preview if not
  if (isPro && output.outputFull) {
    return { content: output.outputFull, authorized: true, outputType: output.outputType, isAnonymous: false };
  }
  
  return { content: output.outputPreview, authorized: false, outputType: output.outputType, isAnonymous: false };
}
