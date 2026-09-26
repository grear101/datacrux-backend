import * as Sentry from '@sentry/nestjs';

// If SENTRY_DSN isn't set (e.g. running locally on a dev machine),
// Sentry's SDK quietly becomes a no-op rather than erroring - same
// fail-soft principle used for Redis and email notifications elsewhere in
// this app.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // Distinguishes errors from Railway's live deployment vs. a local dev
  // run in Sentry's dashboard, so a bug on your own PC never gets
  // confused with a real customer-facing one.
  environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.NODE_ENV ?? 'development',
  // 100% of transactions traced for now - fine at low traffic. Worth
  // lowering (e.g. to 0.1) later if traffic grows enough that this starts
  // eating into Sentry's free-tier quota.
  tracesSampleRate: 1.0,
});
