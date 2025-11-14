export const ReferralConfig = {
  // Reward amounts (in currency units)
  REFERRER_REWARD: 100, // ₹100 for the person who refers
  REFEREE_REWARD: 50, // ₹50 for the person who signs up

  // Coupon configuration
  COUPON_TYPE: 'fixed_amount' as const, // Fixed amount discount
  MIN_ORDER_VALUE: 500, // Minimum order value to use referral coupon
  VALIDITY_DAYS: 30, // Coupon valid for 1 month (30 days)

  // Referral limits
  MAX_REFERRALS_PER_USER: 10, // Maximum number of referrals a user can make

  // Referral code prefix
  REFERRAL_CODE_PREFIX: 'REF',
} as const;

