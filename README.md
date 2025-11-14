# Coupon Management System - Backend

A comprehensive NestJS backend for managing promotional coupon codes with PostgreSQL, Redis caching, and JWT authentication.

## 🚀 Features

- **Coupon Management**: Full CRUD operations with complex business rules
- **Smart Validation**: Date ranges, usage limits, user eligibility, category/product restrictions
- **Discount Types**: Percentage, fixed amount, and free delivery
- **Usage Tracking**: Detailed analytics and reporting
- **Admin Dashboard**: Complete admin interface with analytics
- **JWT Authentication**: Secure auth for customers and admins
- **Redis Caching**: Performance optimization for frequently accessed data
- **Swagger Documentation**: Interactive API docs at `/api`
- **Referral System**: Automatic coupon rewards for referrals
- **Order Management**: Create and cancel orders with coupon application
- **Coupon Recommendations**: Smart coupon suggestions based on cart
- **Cron Jobs**: Automated expiry notifications

## 📋 Prerequisites

- Node.js v18+
- PostgreSQL 15+
- Redis 7+
- npm or yarn

## 🛠️ Installation

1. **Clone and install:**
```bash
cd coupon-management-backend
npm install
```

2. **Environment setup:**
Create `.env` file:
```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=password
DB_DATABASE=coupon_management

JWT_SECRET=your-jwt-secret-key-change-this-in-production
JWT_EXPIRATION=7d

REDIS_HOST=localhost
REDIS_PORT=6379

PORT=3000
NODE_ENV=development
```

3. **Start services:**
```bash
# Using Docker
docker-compose up -d

# Or start PostgreSQL and Redis manually
```

4. **Seed database (optional):**
```bash
npm run seed
```
This creates 10 customers, 2 admins, and 30 coupons with usage history.

5. **Run application:**
```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

The API will be available at `http://localhost:3000`
Swagger docs at `http://localhost:3000/api`

## 📚 API Endpoints

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login and get JWT token

### Customer APIs (Requires JWT)
- `GET /coupons/available` - Get available coupons
- `POST /coupons/:code/validate` - Validate coupon for cart
- `POST /coupons/:code/apply` - Apply coupon to order
- `GET /coupons/my-usage` - Get usage history
- `POST /coupons/recommend` - Get coupon recommendations
- `POST /orders` - Create order with coupon
- `DELETE /orders/:id` - Cancel order

### Admin APIs (Requires JWT + Admin role)
- `POST /admin/coupons` - Create coupon
- `GET /admin/coupons` - List all coupons (with filters)
- `GET /admin/coupons/:id` - Get coupon details
- `PUT /admin/coupons/:id` - Update coupon
- `PATCH /admin/coupons/:id/toggle-status` - Toggle active status
- `DELETE /admin/coupons/:id` - Delete coupon
- `GET /admin/coupons/:id/analytics` - Get coupon analytics
- `GET /admin/reports/top-coupons` - Top performing coupons
- `GET /admin/reports/revenue-impact` - Revenue impact analysis
- `GET /admin/reports/coupon-usage` - Usage reports

## 🗄️ Database Schema

**Entities:**
- `User` - Customers and admins
- `Coupon` - Coupon codes with rules
- `CouponUsage` - Usage tracking
- `Order` - Customer orders
- `Category` - Product categories

## 🔧 Business Rules

### Coupon Validation
- Active status check
- Date validity (start ≤ now ≤ end)
- Minimum order value
- Usage limits (total and per-user)
- User eligibility (new/premium/purchase count)
- Category/product restrictions
- Payment method restrictions
- User-specific coupons

### Discount Calculation
- **Percentage**: `(orderValue × discountValue) / 100` capped at `maxDiscountCap`
- **Fixed Amount**: `min(discountValue, orderValue)`
- **Free Delivery**: Waives delivery charge

### Race Condition Handling
- SQL transactions with pessimistic locking (`SELECT FOR UPDATE`)
- Atomic coupon usage count increment
- Prevents concurrent usage conflicts

## 🎯 Key Features

✅ Complete NestJS setup with TypeORM  
✅ JWT authentication with role-based access  
✅ Comprehensive coupon validation  
✅ Order management with cancellation  
✅ Transaction-based concurrent usage handling  
✅ Redis caching (coupons, users, analytics)  
✅ Swagger API documentation  
✅ Seed data script  

## 🎯 Advanced Features (Optionals)

✅ Coupon recommendations  
✅ Daily cron jobs for expiry notifications  
✅ Referral system with auto-coupon generation  


## 📦 Project Structure

```
src/
├── entities/          # Database entities
├── modules/           # Feature modules
│   ├── auth/         # Authentication
│   ├── user/         # User management
│   ├── coupon/       # Coupon logic
│   ├── order/        # Order management
│   ├── admin/        # Admin APIs
│   └── notification/ # Cron jobs & notifications
├── common/           # Shared utilities
│   ├── guards/       # Auth guards
│   └── decorators/   # Custom decorators
├── config/           # Configuration
└── main.ts           # Application entry
```

## 🧪 Testing

```bash
npm run test          # Unit tests
npm run test:watch    # Watch mode
npm run test:cov      # Coverage
npm run test:e2e     # E2E tests
```

## 📝 Scripts

- `npm run start:dev` - Development mode
- `npm run build` - Build for production
- `npm run start:prod` - Production mode
- `npm run seed` - Seed database with sample data
- `npm run migration:run` - Run migrations

## 🔐 Default Seed Credentials

After running `npm run seed`:

**Customers:**
- Email: `customer1@example.com` to `customer10@example.com`
- Password: `password123`

**Admins:**
- Email: `admin1@example.com`, `admin2@example.com`
- Password: `admin123`

## 📄 License

ISC
