import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../src/entities/user.entity';
import { Coupon, DiscountType, UserSegment } from '../src/entities/coupon.entity';
import { Order, OrderStatus } from '../src/entities/order.entity';
import { CouponUsage, CouponUsageStatus } from '../src/entities/coupon-usage.entity';

async function seed() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_DATABASE || 'coupon_management',
    entities: [User, Coupon, Order, CouponUsage],
    synchronize: false,
    logging: true,
  });

  try {
    await dataSource.initialize();
    console.log('✅ Database connection established');

    const userRepository = dataSource.getRepository(User);
    const couponRepository = dataSource.getRepository(Coupon);
    const orderRepository = dataSource.getRepository(Order);
    const couponUsageRepository = dataSource.getRepository(CouponUsage);

    // Clear existing data (optional - comment out if you want to keep existing data)
    console.log('🗑️  Clearing existing seed data...');
    // Delete in order to avoid foreign key constraints
    await couponUsageRepository.createQueryBuilder().delete().execute();
    await orderRepository.createQueryBuilder().delete().execute();
    await couponRepository.createQueryBuilder().delete().execute();
    await userRepository.createQueryBuilder().delete().execute();
    console.log('✅ Existing data cleared');

    // Create customers
    console.log('👥 Creating customers...');
    const customers: User[] = [];
    const hashedPassword = await bcrypt.hash('password123', 10);

    for (let i = 1; i <= 10; i++) {
      const customer = userRepository.create({
        email: `customer${i}@example.com`,
        name: `Customer ${i}`,
        phone: `+9198765432${i.toString().padStart(2, '0')}`,
        password: hashedPassword,
        role: UserRole.CUSTOMER,
        isNewUser: i <= 3, // First 3 are new users
        isPremiumUser: i >= 8, // Last 3 are premium users
        totalOrders: Math.floor(Math.random() * 20),
        totalSpent: Math.floor(Math.random() * 50000),
        referralCode: `CUST${i.toString().padStart(3, '0')}`,
        isActive: true,
      });
      customers.push(await userRepository.save(customer));
      console.log(`  ✓ Created customer${i}@example.com`);
    }

    // Create admins
    console.log('👨‍💼 Creating admins...');
    const adminPassword = await bcrypt.hash('admin123', 10);
    const admins: User[] = [];

    for (let i = 1; i <= 2; i++) {
      const admin = userRepository.create({
        email: `admin${i}@example.com`,
        name: `Admin ${i}`,
        phone: `+9198765432${(10 + i).toString().padStart(2, '0')}`,
        password: adminPassword,
        role: UserRole.ADMIN,
        isNewUser: false,
        isPremiumUser: false,
        totalOrders: 0,
        totalSpent: 0,
        referralCode: `ADMIN${i}`,
        isActive: true,
      });
      admins.push(await userRepository.save(admin));
      console.log(`  ✓ Created admin${i}@example.com`);
    }

    // Create 30 coupons with various types
    console.log('🎫 Creating coupons...');
    const now = new Date();
    const categories = ['electronics', 'groceries', 'fashion', 'books', 'home', 'sports'];
    const paymentMethods = ['card', 'upi', 'wallet', 'netbanking'];
    const couponTemplates = [
      // Percentage coupons
      { type: DiscountType.PERCENTAGE, value: 10, minOrder: 500, maxCap: 100, title: '10% Off', desc: 'Get 10% off on orders above ₹500' },
      { type: DiscountType.PERCENTAGE, value: 15, minOrder: 1000, maxCap: 200, title: '15% Off', desc: 'Get 15% off on orders above ₹1000' },
      { type: DiscountType.PERCENTAGE, value: 20, minOrder: 1500, maxCap: 300, title: '20% Off', desc: 'Get 20% off on orders above ₹1500' },
      { type: DiscountType.PERCENTAGE, value: 25, minOrder: 2000, maxCap: 500, title: '25% Off', desc: 'Get 25% off on orders above ₹2000' },
      { type: DiscountType.PERCENTAGE, value: 30, minOrder: 3000, maxCap: 750, title: '30% Off', desc: 'Get 30% off on orders above ₹3000' },
      { type: DiscountType.PERCENTAGE, value: 50, minOrder: 5000, maxCap: 1000, title: '50% Off', desc: 'Get 50% off on orders above ₹5000' },
      
      // Fixed amount coupons
      { type: DiscountType.FIXED_AMOUNT, value: 50, minOrder: 500, maxCap: null, title: 'Flat ₹50 Off', desc: 'Get flat ₹50 off on orders above ₹500' },
      { type: DiscountType.FIXED_AMOUNT, value: 100, minOrder: 1000, maxCap: null, title: 'Flat ₹100 Off', desc: 'Get flat ₹100 off on orders above ₹1000' },
      { type: DiscountType.FIXED_AMOUNT, value: 200, minOrder: 1500, maxCap: null, title: 'Flat ₹200 Off', desc: 'Get flat ₹200 off on orders above ₹1500' },
      { type: DiscountType.FIXED_AMOUNT, value: 300, minOrder: 2000, maxCap: null, title: 'Flat ₹300 Off', desc: 'Get flat ₹300 off on orders above ₹2000' },
      { type: DiscountType.FIXED_AMOUNT, value: 500, minOrder: 3000, maxCap: null, title: 'Flat ₹500 Off', desc: 'Get flat ₹500 off on orders above ₹3000' },
      
      // Free delivery coupons
      { type: DiscountType.FREE_DELIVERY, value: 0, minOrder: 500, maxCap: null, title: 'Free Delivery', desc: 'Get free delivery on orders above ₹500' },
      { type: DiscountType.FREE_DELIVERY, value: 0, minOrder: 1000, maxCap: null, title: 'Free Delivery', desc: 'Get free delivery on orders above ₹1000' },
    ];

    const couponCodes = new Set<string>();
    let couponIndex = 1;

    for (let i = 0; i < 30; i++) {
      const admin = admins[i % 2]; // Alternate between admins
      const template = couponTemplates[i % couponTemplates.length];
      
      // Generate unique coupon code
      let code = '';
      do {
        const codePrefix = template.type === DiscountType.PERCENTAGE ? 'SAVE' : 
                          template.type === DiscountType.FIXED_AMOUNT ? 'FLAT' : 'FREE';
        code = `${codePrefix}${template.value}${i + 1}`.toUpperCase();
      } while (couponCodes.has(code));
      couponCodes.add(code);

      // Calculate dates
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - Math.floor(Math.random() * 7)); // Start date can be up to 7 days ago
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 30 + Math.floor(Math.random() * 60)); // Valid for 30-90 days

      // Random attributes
      const hasUsageLimit = Math.random() > 0.3; // 70% have usage limits
      const totalUsageLimit = hasUsageLimit ? 50 + Math.floor(Math.random() * 200) : null;
      const perUserLimit = hasUsageLimit ? 1 + Math.floor(Math.random() * 3) : null;
      
      const userSegment = [UserSegment.ALL, UserSegment.NEW_USERS, UserSegment.PREMIUM_USERS][
        Math.floor(Math.random() * 3)
      ];
      
      const hasCategories = Math.random() > 0.5;
      let applicableCategories: string[] | null = null;
      let excludedCategories: string[] | null = null;
      
      if (hasCategories) {
        // Select applicable categories
        const selectedCategory = categories[Math.floor(Math.random() * categories.length)];
        applicableCategories = [selectedCategory];
        
        // If we also want excluded categories, ensure no overlap
        const hasExcludedCategories = Math.random() > 0.7;
        if (hasExcludedCategories) {
          // Filter out the applicable category from available categories for exclusion
          const availableForExclusion = categories.filter(cat => cat !== selectedCategory);
          if (availableForExclusion.length > 0) {
            excludedCategories = [availableForExclusion[Math.floor(Math.random() * availableForExclusion.length)]];
          }
        }
      } else {
        // No applicable categories, can have excluded categories
        const hasExcludedCategories = Math.random() > 0.7;
        if (hasExcludedCategories) {
          excludedCategories = [categories[Math.floor(Math.random() * categories.length)]];
        }
      }

      const hasPaymentMethods = Math.random() > 0.6;
      const paymentMethodsList = hasPaymentMethods
        ? [paymentMethods[Math.floor(Math.random() * paymentMethods.length)]]
        : null;

      const isUserSpecific = Math.random() > 0.8; // 20% are user-specific
      const targetUserId = isUserSpecific ? customers[Math.floor(Math.random() * customers.length)].id : null;

      const coupon = couponRepository.create({
        code,
        title: `${template.title} - Coupon ${couponIndex}`,
        description: template.desc,
        discountType: template.type,
        discountValue: template.value,
        minOrderValue: template.minOrder,
        maxDiscountCap: template.maxCap,
        startDate,
        endDate,
        isActive: Math.random() > 0.1, // 90% are active
        totalUsageLimit,
        perUserLimit,
        currentUsageCount: 0, // Will be updated after creating usage records
        applicableCategories,
        excludedCategories,
        userSegment,
        paymentMethods: paymentMethodsList,
        targetUserId,
        createdBy: admin.id,
      });

      const savedCoupon = await couponRepository.save(coupon);
      console.log(`  ✓ Created coupon: ${code} (by ${admin.email})`);
      couponIndex++;
    }

    // Fetch all coupons for creating usage history
    const allCoupons = await couponRepository.find();
    console.log('\n📦 Creating orders and coupon usage history...');

    // Helper function to calculate discount
    const calculateDiscount = (coupon: Coupon, orderValue: number): number => {
      if (coupon.discountType === DiscountType.PERCENTAGE) {
        const discount = (orderValue * Number(coupon.discountValue)) / 100;
        const maxCap = coupon.maxDiscountCap ? Number(coupon.maxDiscountCap) : null;
        return maxCap ? Math.min(discount, maxCap) : discount;
      } else if (coupon.discountType === DiscountType.FIXED_AMOUNT) {
        return Number(coupon.discountValue);
      } else if (coupon.discountType === DiscountType.FREE_DELIVERY) {
        // Assume delivery charge is 50
        return 50;
      }
      return 0;
    };

    // Create orders and coupon usage for some coupons
    let totalOrdersCreated = 0;
    let totalUsageCreated = 0;

    for (const coupon of allCoupons) {
      // Only create usage for active coupons that have started
      const now = new Date();
      if (!coupon.isActive || now < coupon.startDate || now > coupon.endDate) {
        continue;
      }

      // Determine how many times this coupon should be used
      const maxUsages = coupon.totalUsageLimit 
        ? Math.min(coupon.totalUsageLimit, 20 + Math.floor(Math.random() * 30))
        : 5 + Math.floor(Math.random() * 15);
      
      const actualUsages = Math.floor(Math.random() * maxUsages) + 1;

      // Track usage per user to respect perUserLimit
      const userUsageCount = new Map<string, number>();

      for (let i = 0; i < actualUsages; i++) {
        // Select a random customer
        let selectedCustomer = customers[Math.floor(Math.random() * customers.length)];
        
        // If coupon is user-specific, use the target user
        if (coupon.targetUserId) {
          selectedCustomer = customers.find(c => c.id === coupon.targetUserId) || selectedCustomer;
        }

        // Check per-user limit
        const userUsage = userUsageCount.get(selectedCustomer.id) || 0;
        if (coupon.perUserLimit && userUsage >= coupon.perUserLimit) {
          continue; // Skip if user has reached their limit
        }

        // Generate order value (must be >= minOrderValue)
        const minOrder = Number(coupon.minOrderValue);
        const orderValue = minOrder + Math.floor(Math.random() * (minOrder * 2));

        // Calculate discount
        const discountAmount = calculateDiscount(coupon, orderValue);
        const finalAmount = orderValue - discountAmount;

        // Create order
        const order = orderRepository.create({
          userId: selectedCustomer.id,
          orderValue,
          discountAmount,
          finalAmount,
          appliedCouponCode: coupon.code,
          items: [
            {
              productId: `prod-${Math.random().toString(36).substring(2, 11)}`,
              quantity: 1 + Math.floor(Math.random() * 3),
              price: orderValue / (1 + Math.floor(Math.random() * 3)),
              category: coupon.applicableCategories?.[0] || 'general',
            },
          ],
          paymentMethod: coupon.paymentMethods?.[0] || ['card', 'upi', 'wallet'][Math.floor(Math.random() * 3)],
          status: [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.DELIVERED][
            Math.floor(Math.random() * 3)
          ],
        });

        const savedOrder = await orderRepository.save(order);
        totalOrdersCreated++;

        // Create coupon usage record
        const couponUsage = couponUsageRepository.create({
          couponId: coupon.id,
          userId: selectedCustomer.id,
          orderId: savedOrder.id,
          discountApplied: discountAmount,
          orderValue,
          finalOrderValue: finalAmount,
          status: CouponUsageStatus.APPLIED,
        });

        await couponUsageRepository.save(couponUsage);
        totalUsageCreated++;

        // Update user usage count
        userUsageCount.set(selectedCustomer.id, userUsage + 1);

        // Update coupon's currentUsageCount
        coupon.currentUsageCount += 1;
        await couponRepository.save(coupon);
      }
    }

    // Update user stats based on orders
    for (const customer of customers) {
      const customerOrders = await orderRepository.find({
        where: { userId: customer.id },
      });

      const totalOrders = customerOrders.length;
      const totalSpent = customerOrders.reduce((sum, order) => sum + Number(order.finalAmount), 0);

      customer.totalOrders = totalOrders;
      customer.totalSpent = totalSpent;
      await userRepository.save(customer);
    }

    console.log('\n✅ Seed data created successfully!');
    console.log('\n📋 Summary:');
    console.log(`   - ${customers.length} customers created`);
    console.log(`   - ${admins.length} admins created`);
    console.log(`   - 30 coupons created`);
    console.log(`   - ${totalOrdersCreated} orders created`);
    console.log(`   - ${totalUsageCreated} coupon usage records created`);
    console.log('\n🔑 Login Credentials:');
    console.log('   Customers: customer1@example.com to customer10@example.com');
    console.log('   Password: password123');
    console.log('   Admins: admin1@example.com, admin2@example.com');
    console.log('   Password: admin123');

    await dataSource.destroy();
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

seed();

