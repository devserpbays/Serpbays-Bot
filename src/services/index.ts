/**
 * Data access layer — barrel export.
 *
 * All database operations should go through these services.
 * This is the single layer to swap when changing DB engines.
 *
 * Usage:
 *   import { getSettings, updatePost } from '@/services';
 *   // or
 *   import { getSettings } from '@/services/settingsService';
 */

export * from './settingsService';
export * from './postService';
export * from './subscriptionService';
export * from './notificationService';
export * from './activityLogService';

// cookieStore is already its own service at src/lib/cookieStore.ts
// (handles encryption, so it stays separate)
