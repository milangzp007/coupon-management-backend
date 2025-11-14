# Key Architectural Decisions

## Table of Contents
1. [Framework & Technology Stack](#framework--technology-stack)
2. [Application Architecture](#application-architecture)
3. [Database Design](#database-design)
4. [Security Architecture](#security-architecture)
5. [Caching Strategy](#caching-strategy)
6. [Concurrency & Transaction Management](#concurrency--transaction-management)
7. [API Design](#api-design)
8. [Error Handling & Validation](#error-handling--validation)
9. [Testing Strategy](#testing-strategy)
10. [Deployment & Scalability](#deployment--scalability)

---

## Framework & Technology Stack

### Decision: NestJS with TypeScript
**Rationale:**
- **Modular Architecture**: NestJS follows Angular-like modular structure, making code organization intuitive
- **Type Safety**: TypeScript provides compile-time error checking and better IDE support
- **Dependency Injection**: Built-in DI container enables testability and loose coupling
- **Enterprise-Ready**: Built-in support for validation, guards, interceptors, and pipes
- **Active Ecosystem**: Strong community support and extensive documentation

**Alternatives Considered:**
- Express.js: Too low-level, requires more boilerplate
- Fastify: Faster but less mature ecosystem
- LoopBack: Over-engineered for this use case

---

## Application Architecture

### Decision: Modular Monolith Pattern
**Structure:**
```
src/
├── entities/          # Database entities (Domain Models)
├── modules/           # Feature modules (Domain-Driven Design)
│   ├── auth/         # Authentication & Authorization
│   ├── user/         # User Management
│   ├── coupon/       # Core Coupon Business Logic
│   ├── order/        # Order Management
│   ├── admin/        # Admin Operations
│   └── notification/ # Background Jobs
├── common/           # Shared Cross-Cutting Concerns
│   ├── guards/       # Authentication & Authorization Guards
│   └── decorators/   # Custom Decorators
└── config/           # Configuration Services
```

**Rationale:**
- **Separation of Concerns**: Each module handles a specific domain
- **Scalability**: Easy to extract modules into microservices if needed
- **Testability**: Modules can be tested in isolation
- **Maintainability**: Clear boundaries and responsibilities

### Decision: Service Layer Pattern
**Implementation:**
- Controllers handle HTTP requests/responses
- Services contain business logic
- Repositories (via TypeORM) handle data access
- DTOs for data validation and transformation

**Benefits:**
- Business logic separated from HTTP concerns
- Reusable services across different controllers
- Easier unit testing

---

## Database Design

### Decision: PostgreSQL with TypeORM
**Rationale:**
- **ACID Compliance**: Ensures data consistency for financial transactions
- **JSONB Support**: Flexible storage for order items and coupon arrays
- **TypeORM**: Type-safe ORM with excellent TypeScript support
- **Migrations**: Built-in migration support for schema versioning

### Decision: UUID Primary Keys
**Implementation:**
```typescript
@PrimaryGeneratedColumn('uuid')
id: string;
```

**Rationale:**
- **Security**: UUIDs don't expose sequential IDs (prevents enumeration attacks)
- **Distributed Systems**: Can generate IDs without database round-trip
- **Merge-Friendly**: Easier to merge data from different sources

### Decision: Soft Delete for Coupons
**Implementation:**
- Coupons are marked `isActive: false` instead of hard deletion
- Preserves historical data and analytics

**Rationale:**
- **Audit Trail**: Maintains history of all coupons
- **Analytics**: Historical data remains available
- **Recovery**: Can reactivate coupons if needed

### Decision: Separate CouponUsage Entity
**Implementation:**
- `CouponUsage` tracks each application separately from `Coupon`
- Links to `Order` for complete audit trail

**Rationale:**
- **Normalization**: Avoids data duplication
- **Analytics**: Easy to query usage patterns
- **Audit**: Complete history of coupon applications
- **Flexibility**: Can track status changes (APPLIED → REFUNDED)

---

## Security Architecture

### Decision: JWT-Based Authentication
**Implementation:**
- Access tokens with configurable expiration (default: 7 days)
- Bearer token in Authorization header
- Stateless authentication (no server-side session storage)

**Rationale:**
- **Scalability**: No session storage needed
- **Stateless**: Works well in distributed systems
- **Standard**: Industry-standard approach

### Decision: Role-Based Access Control (RBAC)
**Implementation:**
- `@Roles()` decorator for role-based endpoints
- `RolesGuard` enforces role checks
- `UserRole` enum: CUSTOMER | ADMIN

**Rationale:**
- **Fine-Grained Control**: Different permissions for different roles
- **Extensible**: Easy to add new roles
- **Declarative**: Clear intent in code

### Decision: Password Hashing with bcrypt
**Implementation:**
- bcrypt with salt rounds (10)
- Passwords never stored in plain text

**Rationale:**
- **Security**: Industry-standard hashing algorithm
- **Resilience**: Resistant to rainbow table attacks
- **Performance**: Configurable cost factor

---

## Caching Strategy

### Decision: Redis for Multi-Layer Caching
**Implementation:**
- **Layer 1**: Coupon lookups (`coupon_{code}`)
- **Layer 2**: Available coupons per user (`available_coupons_{userId}`)
- **Layer 3**: User lookups (`user_{id}`, `user_email_{email}`)
- **Layer 4**: Analytics data (top coupons, revenue impact)

**Cache Keys:**
```
coupon_{code}                    # TTL: 15 minutes
available_coupons_{userId}        # TTL: 15 minutes
user_{id}                        # TTL: 15 minutes
user_email_{email}               # TTL: 15 minutes
analytics_top_coupons_{limit}    # TTL: 30 minutes
analytics_revenue_{dateKey}      # TTL: 30 minutes
analytics_coupon_{couponId}      # TTL: 15 minutes
```

**TTL Strategy:**
- **Short TTL (15 min)**: Frequently changing data (coupons, users)
- **Medium TTL (30 min)**: Analytics aggregations
- **Cache Invalidation**: On write operations (create, update, delete)

**Rationale:**
- **Performance**: Reduces database load by 60-80%
- **Scalability**: Handles high read traffic
- **Cost-Effective**: Redis is memory-efficient
- **Consistency**: TTL + invalidation ensures data freshness

---

## Concurrency & Transaction Management

### Decision: Pessimistic Locking for Coupon Application
**Implementation:**
```typescript
return await this.dataSource.transaction(async (manager) => {
  const coupon = await manager.findOne(Coupon, {
    where: { code: code.toUpperCase() },
    lock: { mode: 'pessimistic_write' }, // SELECT FOR UPDATE
  });
  // ... validation and usage count increment
});
```

**Rationale:**
- **Race Condition Prevention**: Ensures atomic coupon usage
- **Data Integrity**: Prevents double-spending of coupons
- **Consistency**: Guarantees usage limits are respected
- **Performance Trade-off**: Acceptable for critical operations

**Alternatives Considered:**
- Optimistic Locking: Higher throughput but complex conflict resolution
- Distributed Locks: Overkill for single-database setup

### Decision: Transaction Boundaries
**Implementation:**
- `applyCoupon`: Entire operation in single transaction
- `createOrder`: Separate transaction (creates CouponUsage after Order)
- `cancelOrder`: Transaction with coupon revert logic

**Rationale:**
- **Atomicity**: All-or-nothing operations
- **Consistency**: Database always in valid state
- **Isolation**: Prevents dirty reads/writes

---

## API Design

### Decision: RESTful API with Resource-Based URLs
**Structure:**
```
POST   /auth/register
POST   /auth/login
GET    /coupons/available
POST   /coupons/:code/validate
POST   /coupons/:code/apply
GET    /coupons/my-usage
POST   /coupons/recommend
POST   /orders
DELETE /orders/:id
GET    /admin/coupons
POST   /admin/coupons
PUT    /admin/coupons/:id
GET    /admin/reports/top-coupons
```

**Rationale:**
- **Standard**: Follows REST conventions
- **Predictable**: Easy to understand and use
- **Stateless**: Each request contains all necessary information

### Decision: Swagger/OpenAPI Documentation
**Implementation:**
- Auto-generated API documentation at `/api`
- Interactive testing interface
- Request/response schemas

**Rationale:**
- **Developer Experience**: Self-documenting APIs
- **Testing**: Built-in API testing interface
- **Integration**: Easy for frontend developers

### Decision: DTOs for Request Validation
**Implementation:**
- `class-validator` decorators for validation
- `class-transformer` for data transformation
- Global validation pipe with whitelist

**Rationale:**
- **Type Safety**: Compile-time and runtime validation
- **Security**: Prevents injection attacks via whitelist
- **Documentation**: DTOs serve as API contracts

---

## Error Handling & Validation

### Decision: Exception Filters
**Implementation:**
- Custom exceptions: `NotFoundException`, `BadRequestException`, `ConflictException`
- Consistent error response format
- HTTP status codes aligned with REST standards

**Rationale:**
- **Consistency**: Uniform error responses
- **Debugging**: Clear error messages
- **Client-Friendly**: Actionable error information

### Decision: Multi-Layer Validation
**Implementation:**
1. **Frontend**: Real-time validation (UX)
2. **DTO Validation**: `class-validator` decorators
3. **Service Layer**: Business rule validation
4. **Database**: Constraints and foreign keys

**Rationale:**
- **Defense in Depth**: Multiple layers catch errors
- **User Experience**: Frontend validation provides immediate feedback
- **Data Integrity**: Backend validation ensures correctness

---

## Testing Strategy

### Decision: Jest for Unit & Integration Testing
**Implementation:**
- Unit tests for services (mocked dependencies)
- Integration tests for API endpoints
- Coverage threshold: 50% global, 70% for services

**Rationale:**
- **NestJS Integration**: Built-in Jest support
- **Mocking**: Easy to mock dependencies
- **Coverage**: Built-in coverage reporting

### Decision: Test Organization
**Structure:**
```
src/modules/
  ├── auth/
  │   └── auth.service.spec.ts
  ├── coupon/
  │   └── coupon.service.spec.ts
  └── ...
```

**Rationale:**
- **Co-location**: Tests next to source code
- **Discoverability**: Easy to find related tests
- **Maintenance**: Changes to code and tests stay together

---

## Deployment & Scalability

### Decision: Environment-Based Configuration
**Implementation:**
- `.env` files for environment variables
- `ConfigModule` for centralized configuration
- Different configs for dev/staging/production

**Rationale:**
- **Security**: Secrets not in code
- **Flexibility**: Easy to change per environment
- **12-Factor App**: Follows best practices

### Decision: Docker Compose for Local Development
**Implementation:**
- PostgreSQL container
- Redis container
- Easy local setup

**Rationale:**
- **Consistency**: Same environment across team
- **Quick Setup**: One command to start services
- **Isolation**: No conflicts with local installations

### Decision: Horizontal Scalability Ready
**Considerations:**
- Stateless API (JWT tokens)
- Redis for shared cache
- Database connection pooling
- No in-memory state

**Rationale:**
- **Future-Proof**: Can scale horizontally when needed
- **Load Balancing**: Stateless design enables easy LB
- **High Availability**: Multiple instances possible

---

## Additional Architectural Decisions

### Decision: Referral System with Auto-Coupon Generation
**Implementation:**
- Referral codes stored in User entity
- Auto-generation of user-specific coupons on referral
- Configurable reward amounts via `ReferralConfig`

**Rationale:**
- **Automation**: Reduces manual coupon creation
- **User Experience**: Seamless referral process
- **Flexibility**: Configurable parameters

### Decision: Cron Jobs for Background Tasks
**Implementation:**
- `@nestjs/schedule` for cron jobs
- Daily job for coupon expiry notifications
- Extensible for future scheduled tasks

**Rationale:**
- **Automation**: Reduces manual intervention
- **User Engagement**: Proactive notifications
- **Scalability**: Background processing doesn't block API

### Decision: Per-Item Coupon Validation
**Implementation:**
- Coupons can apply to specific items in cart
- Discount breakdown per product
- Non-applicable items identified with reasons

**Rationale:**
- **Flexibility**: Fine-grained control
- **Transparency**: Users see exactly what's discounted
- **Business Logic**: Supports complex discount rules

### Decision: Coupon Recommendation Engine
**Implementation:**
- Algorithm evaluates all available coupons
- Sorts by potential savings
- Returns best coupon + alternatives

**Rationale:**
- **User Experience**: Helps users find best deals
- **Business Value**: Increases coupon usage
- **Smart Suggestions**: Data-driven recommendations

---

## Trade-offs & Considerations

### Performance vs. Consistency
- **Chosen**: Strong consistency with transactions
- **Trade-off**: Slightly slower but guarantees correctness
- **Justification**: Financial data requires accuracy

### Cache Invalidation Complexity
- **Chosen**: Manual invalidation on writes
- **Trade-off**: More code but explicit control
- **Justification**: Predictable cache behavior

### Monolith vs. Microservices
- **Chosen**: Modular monolith
- **Trade-off**: Simpler deployment, but less independent scaling
- **Justification**: Current scale doesn't require microservices

---

## Future Considerations

1. **Event-Driven Architecture**: Consider event bus for decoupling modules
2. **Message Queue**: For async processing (notifications, analytics)
3. **Read Replicas**: For scaling read-heavy analytics queries
4. **GraphQL**: If frontend needs flexible queries
5. **Microservices**: Extract modules if they need independent scaling

---

## Summary

This architecture prioritizes:
- ✅ **Correctness**: Transactions and validation ensure data integrity
- ✅ **Performance**: Redis caching reduces database load
- ✅ **Security**: JWT, RBAC, and input validation
- ✅ **Maintainability**: Modular structure and clear separation of concerns
- ✅ **Scalability**: Stateless design ready for horizontal scaling
- ✅ **Developer Experience**: TypeScript, Swagger, comprehensive tests

