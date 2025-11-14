# Seed Data Script

This script populates the database with sample data for testing and development.

## What it creates:

- **10 Customers**: `customer1@example.com` to `customer10@example.com`
  - Password: `password123`
  - First 3 are new users
  - Last 3 are premium users
  - Random order counts and spending

- **2 Admins**: `admin1@example.com`, `admin2@example.com`
  - Password: `admin123`

- **30 Coupons**: Various types distributed between both admins
  - Percentage discounts (10%, 15%, 20%, 25%, 30%, 50%)
  - Fixed amount discounts (₹50, ₹100, ₹200, ₹300, ₹500)
  - Free delivery coupons
  - Different user segments (all, new_users, premium_users)
  - Various usage limits and restrictions
  - Some user-specific coupons

## Usage:

```bash
# Make sure your .env file has the correct database credentials
npm run seed
```

## Important Notes:

- The script will **delete all existing coupons and users** before seeding
- Make sure your database is running and accessible
- The script uses environment variables from your `.env` file:
  - `DB_HOST` (default: localhost)
  - `DB_PORT` (default: 5432)
  - `DB_USERNAME` (default: postgres)
  - `DB_PASSWORD` (default: password)
  - `DB_DATABASE` (default: coupon_management)

## Login Credentials:

**Customers:**
- Email: `customer1@example.com` to `customer10@example.com`
- Password: `password123`

**Admins:**
- Email: `admin1@example.com`, `admin2@example.com`
- Password: `admin123`

