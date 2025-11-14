export const NotificationConfig = {
  // Days before expiry to send notification
  EXPIRY_NOTIFICATION_DAYS: 3,

  // Cron schedule for daily notification job
  // Default: Every day at 9:00 AM
  CRON_SCHEDULE: '0 9 * * *', // CronExpression.EVERY_DAY_AT_9AM

  // Email notification settings (to be configured)
  EMAIL_ENABLED: false,
  EMAIL_FROM: 'noreply@couponapp.com',
  EMAIL_SUBJECT: 'Your coupon expires soon!',

  // Push notification settings (to be configured)
  PUSH_NOTIFICATION_ENABLED: false,
} as const;

