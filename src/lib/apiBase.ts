/**
 * API base URL for the backend.
 * In development, point this to the remote backend server.
 * In production, leave empty to use the same origin.
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
