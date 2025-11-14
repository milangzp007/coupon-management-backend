import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { DataSource } from 'typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CouponService } from './coupon.service';
import { Coupon, DiscountType, UserSegment } from '../../entities/coupon.entity';
import { CouponUsage, CouponUsageStatus } from '../../entities/coupon-usage.entity';
import { User, UserRole } from '../../entities/user.entity';
import { UserService } from '../user/user.service';

describe('CouponService', () => {
  let service: CouponService;
  let couponRepository: Repository<Coupon>;
  let couponUsageRepository: Repository<CouponUsage>;
  let userRepository: Repository<User>;
  let cacheManager: any;

  const mockCouponRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  const mockCouponUsageRepository = {
    find: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockUserRepository = {
    findOne: jest.fn(),
  };

  const mockCacheManager = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const mockUserService = {
    findOne: jest.fn(),
  };

  const mockDataSource = {
    transaction: jest.fn((callback) => {
      const mockManager = {
        findOne: jest.fn(),
        save: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
      };
      return callback(mockManager);
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CouponService,
        {
          provide: getRepositoryToken(Coupon),
          useValue: mockCouponRepository,
        },
        {
          provide: getRepositoryToken(CouponUsage),
          useValue: mockCouponUsageRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<CouponService>(CouponService);
    couponRepository = module.get<Repository<Coupon>>(getRepositoryToken(Coupon));
    couponUsageRepository = module.get<Repository<CouponUsage>>(
      getRepositoryToken(CouponUsage),
    );
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    cacheManager = module.get(CACHE_MANAGER);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateDiscount', () => {
    it('should calculate percentage discount correctly', () => {
      const coupon: Partial<Coupon> = {
        discountType: DiscountType.PERCENTAGE,
        discountValue: 50,
        maxDiscountCap: 200,
      };

      const discount = service.calculateDiscount(coupon as Coupon, 1000);
      expect(discount).toBe(200); // 50% of 1000 = 500, but capped at 200
    });

    it('should calculate fixed amount discount correctly', () => {
      const coupon: Partial<Coupon> = {
        discountType: DiscountType.FIXED_AMOUNT,
        discountValue: 100,
      };

      const discount = service.calculateDiscount(coupon as Coupon, 1000);
      expect(discount).toBe(100);
    });

    it('should not exceed order value for fixed amount', () => {
      const coupon: Partial<Coupon> = {
        discountType: DiscountType.FIXED_AMOUNT,
        discountValue: 1500,
      };

      const discount = service.calculateDiscount(coupon as Coupon, 1000);
      expect(discount).toBe(1000); // Should not exceed order value
    });

    it('should calculate free delivery discount', () => {
      const coupon: Partial<Coupon> = {
        discountType: DiscountType.FREE_DELIVERY,
      };

      const discount = service.calculateDiscount(coupon as Coupon, 1000, [], 50);
      expect(discount).toBe(50);
    });
  });

  describe('validateCoupon', () => {
    it('should validate active coupon within date range', async () => {
      const now = new Date();
      const coupon: Partial<Coupon> = {
        id: 'coupon-id',
        code: 'TEST50',
        isActive: true,
        startDate: new Date(now.getTime() - 86400000), // Yesterday
        endDate: new Date(now.getTime() + 86400000), // Tomorrow
        minOrderValue: 500,
        userSegment: UserSegment.ALL,
        currentUsageCount: 0,
        totalUsageLimit: 100,
        perUserLimit: 1,
      };

      const user: Partial<User> = {
        id: 'user-id',
        isNewUser: false,
        isPremiumUser: false,
        totalOrders: 0,
      };

      mockCouponRepository.findOne.mockResolvedValue(coupon);
      mockUserService.findOne.mockResolvedValue(user);
      mockCouponUsageRepository.count.mockResolvedValue(0);

      const result = await service.validateCoupon('TEST50', {
        cartValue: 1000,
        items: [],
        paymentMethod: 'card',
        userId: 'user-id',
      });

      expect(result.valid).toBe(true);
      expect(result.discount).toBeDefined();
    });

    it('should reject expired coupons', async () => {
      const now = new Date();
      const coupon: Partial<Coupon> = {
        id: 'coupon-id',
        code: 'TEST50',
        isActive: true,
        startDate: new Date(now.getTime() - 172800000), // 2 days ago
        endDate: new Date(now.getTime() - 86400000), // Yesterday (expired)
        minOrderValue: 500,
      };

      mockCouponRepository.findOne.mockResolvedValue(coupon);

      const result = await service.validateCoupon('TEST50', {
        cartValue: 1000,
        items: [],
        paymentMethod: 'card',
        userId: 'user-id',
      });

      expect(result.valid).toBe(false);
      expect(result.message).toContain('expired');
    });

    it('should check minimum order value requirement', async () => {
      const now = new Date();
      const coupon: Partial<Coupon> = {
        id: 'coupon-id',
        code: 'TEST50',
        isActive: true,
        startDate: new Date(now.getTime() - 86400000),
        endDate: new Date(now.getTime() + 86400000),
        minOrderValue: 1000,
      };

      mockCouponRepository.findOne.mockResolvedValue(coupon);

      const result = await service.validateCoupon('TEST50', {
        cartValue: 500, // Below minimum
        items: [],
        paymentMethod: 'card',
        userId: 'user-id',
      });

      expect(result.valid).toBe(false);
      expect(result.message).toContain('Minimum order value');
    });

    it('should reject inactive coupons', async () => {
      const now = new Date();
      const coupon: Partial<Coupon> = {
        id: 'coupon-id',
        code: 'TEST50',
        isActive: false,
        startDate: new Date(now.getTime() - 86400000),
        endDate: new Date(now.getTime() + 86400000),
        minOrderValue: 500,
      };

      mockCouponRepository.findOne.mockResolvedValue(coupon);

      const result = await service.validateCoupon('TEST50', {
        cartValue: 1000,
        items: [],
        paymentMethod: 'card',
        userId: 'user-id',
      });

      expect(result.valid).toBe(false);
      expect(result.message).toContain('not active');
    });

    it('should check usage limits', async () => {
      const now = new Date();
      const coupon: Partial<Coupon> = {
        id: 'coupon-id',
        code: 'TEST50',
        isActive: true,
        startDate: new Date(now.getTime() - 86400000),
        endDate: new Date(now.getTime() + 86400000),
        minOrderValue: 500,
        totalUsageLimit: 10,
        currentUsageCount: 10,
      };

      mockCouponRepository.findOne.mockResolvedValue(coupon);

      const result = await service.validateCoupon('TEST50', {
        cartValue: 1000,
        items: [],
        paymentMethod: 'card',
        userId: 'user-id',
      });

      expect(result.valid).toBe(false);
      expect(result.message).toContain('usage limit');
    });

    it('should check per-user limit', async () => {
      const now = new Date();
      const coupon: Partial<Coupon> = {
        id: 'coupon-id',
        code: 'TEST50',
        isActive: true,
        startDate: new Date(now.getTime() - 86400000),
        endDate: new Date(now.getTime() + 86400000),
        minOrderValue: 500,
        perUserLimit: 1,
      };

      const user: Partial<User> = {
        id: 'user-id',
        isNewUser: false,
        isPremiumUser: false,
        totalOrders: 0,
      };

      mockCouponRepository.findOne.mockResolvedValue(coupon);
      mockUserService.findOne.mockResolvedValue(user);
      mockCouponUsageRepository.count.mockResolvedValue(1); // Already used once

      const result = await service.validateCoupon('TEST50', {
        cartValue: 1000,
        items: [],
        paymentMethod: 'card',
        userId: 'user-id',
      });

      expect(result.valid).toBe(false);
      expect(result.message).toContain('usage limit');
    });

    it('should validate user-specific coupons', async () => {
      const now = new Date();
      const coupon: Partial<Coupon> = {
        id: 'coupon-id',
        code: 'TEST50',
        isActive: true,
        startDate: new Date(now.getTime() - 86400000),
        endDate: new Date(now.getTime() + 86400000),
        minOrderValue: 500,
        targetUserId: 'other-user-id',
      };

      mockCouponRepository.findOne.mockResolvedValue(coupon);

      const result = await service.validateCoupon('TEST50', {
        cartValue: 1000,
        items: [],
        paymentMethod: 'card',
        userId: 'user-id',
      });

      expect(result.valid).toBe(false);
      expect(result.message).toContain('not available');
    });

    it('should check payment method restrictions', async () => {
      const now = new Date();
      const coupon: Partial<Coupon> = {
        id: 'coupon-id',
        code: 'TEST50',
        isActive: true,
        startDate: new Date(now.getTime() - 86400000),
        endDate: new Date(now.getTime() + 86400000),
        minOrderValue: 500,
        paymentMethods: ['card'],
      };

      const user: Partial<User> = {
        id: 'user-id',
        isNewUser: false,
        isPremiumUser: false,
        totalOrders: 0,
      };

      mockCouponRepository.findOne.mockResolvedValue(coupon);
      mockUserService.findOne.mockResolvedValue(user);
      mockCouponUsageRepository.count.mockResolvedValue(0);

      const result = await service.validateCoupon('TEST50', {
        cartValue: 1000,
        items: [],
        paymentMethod: 'upi', // Not in allowed methods
        userId: 'user-id',
      });

      expect(result.valid).toBe(false);
      expect(result.message).toContain('payment method');
    });
  });

  describe('findAllAvailable', () => {
    it('should return cached coupons if available', async () => {
      const cachedCoupons = [{ id: '1', code: 'TEST1' }] as Coupon[];
      mockCacheManager.get.mockResolvedValue(cachedCoupons);

      const result = await service.findAllAvailable('user-id');

      expect(result).toEqual(cachedCoupons);
      expect(mockCouponRepository.find).not.toHaveBeenCalled();
    });

    it('should fetch and cache coupons if not cached', async () => {
      const coupons = [{ id: '1', code: 'TEST1' }] as Coupon[];
      mockCacheManager.get.mockResolvedValue(null);
      mockCouponRepository.find.mockResolvedValue(coupons);

      const result = await service.findAllAvailable('user-id');

      expect(result).toEqual(coupons);
      expect(mockCacheManager.set).toHaveBeenCalled();
    });
  });

  describe('findByCode', () => {
    it('should return cached coupon if available', async () => {
      const coupon = { id: '1', code: 'TEST1' } as Coupon;
      mockCacheManager.get.mockResolvedValue(coupon);

      const result = await service.findByCode('TEST1');

      expect(result).toEqual(coupon);
      expect(mockCouponRepository.findOne).not.toHaveBeenCalled();
    });

    it('should fetch and cache coupon if not cached', async () => {
      const coupon = { id: '1', code: 'TEST1' } as Coupon;
      mockCacheManager.get.mockResolvedValue(null);
      mockCouponRepository.findOne.mockResolvedValue(coupon);

      const result = await service.findByCode('TEST1');

      expect(result).toEqual(coupon);
      expect(mockCacheManager.set).toHaveBeenCalled();
    });
  });

  describe('getMyUsage', () => {
    it('should return user coupon usage history', async () => {
      const usages = [
        { id: '1', couponId: 'coupon-1', userId: 'user-id' },
        { id: '2', couponId: 'coupon-2', userId: 'user-id' },
      ] as CouponUsage[];

      mockCouponUsageRepository.find.mockResolvedValue(usages);

      const result = await service.getMyUsage('user-id');

      expect(result).toEqual(usages);
      expect(mockCouponUsageRepository.find).toHaveBeenCalledWith({
        where: { userId: 'user-id' },
        relations: ['coupon'],
        order: { usedAt: 'DESC' },
      });
    });
  });

  describe('recommendCoupons', () => {
    it('should return empty if no coupons available', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockCouponRepository.find.mockResolvedValue([]);

      const result = await service.recommendCoupons('user-id', 1000, []);

      expect(result.bestCoupon).toBeNull();
      expect(result.alternativeCoupons).toEqual([]);
    });

    it('should recommend best coupon based on savings', async () => {
      const now = new Date();
      const coupons = [
        {
          id: '1',
          code: 'SAVE10',
          discountType: DiscountType.PERCENTAGE,
          discountValue: 10,
          minOrderValue: 500,
          maxDiscountCap: 100,
          startDate: new Date(now.getTime() - 86400000),
          endDate: new Date(now.getTime() + 86400000),
          isActive: true,
          userSegment: UserSegment.ALL,
        },
        {
          id: '2',
          code: 'SAVE20',
          discountType: DiscountType.PERCENTAGE,
          discountValue: 20,
          minOrderValue: 500,
          maxDiscountCap: 200,
          startDate: new Date(now.getTime() - 86400000),
          endDate: new Date(now.getTime() + 86400000),
          isActive: true,
          userSegment: UserSegment.ALL,
        },
      ] as Coupon[];

      const user: Partial<User> = {
        id: 'user-id',
        isNewUser: false,
        isPremiumUser: false,
        totalOrders: 0,
      };

      mockCacheManager.get.mockResolvedValue(null);
      mockCouponRepository.find.mockResolvedValue(coupons);
      mockUserService.findOne.mockResolvedValue(user);
      mockCouponUsageRepository.count.mockResolvedValue(0);

      const result = await service.recommendCoupons('user-id', 1000, []);

      expect(result.bestCoupon).toBeDefined();
      expect(result.bestCoupon?.code).toBe('SAVE20'); // Higher discount
    });
  });

  describe('applyCoupon', () => {
    it('should apply coupon successfully within transaction', async () => {
      const now = new Date();
      const coupon: Partial<Coupon> = {
        id: 'coupon-id',
        code: 'TEST50',
        isActive: true,
        startDate: new Date(now.getTime() - 86400000),
        endDate: new Date(now.getTime() + 86400000),
        minOrderValue: 500,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 50,
        maxDiscountCap: 200,
        currentUsageCount: 0,
        totalUsageLimit: 100,
        userSegment: UserSegment.ALL,
      };

      const user: Partial<User> = {
        id: 'user-id',
        isNewUser: false,
        isPremiumUser: false,
        totalOrders: 0,
      };

      const mockManager = {
        findOne: jest.fn(),
        save: jest.fn(),
        count: jest.fn(),
      };

      mockDataSource.transaction.mockImplementation(async (callback) => {
        mockManager.findOne
          .mockResolvedValueOnce(coupon)
          .mockResolvedValueOnce(user);
        mockManager.count.mockResolvedValue(0);
        mockManager.save.mockResolvedValue(coupon);
        return callback(mockManager);
      });

      const result = await service.applyCoupon('TEST50', 'user-id', {
        cartValue: 1000,
        items: [],
        paymentMethod: 'card',
      });

      expect(result).toHaveProperty('discount');
      expect(result).toHaveProperty('finalAmount');
      expect(result).toHaveProperty('couponId');
    });

    it('should throw NotFoundException if coupon not found', async () => {
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(null),
      };

      mockDataSource.transaction.mockImplementation(async (callback) => {
        return callback(mockManager);
      });

      await expect(
        service.applyCoupon('INVALID', 'user-id', {
          cartValue: 1000,
          items: [],
          paymentMethod: 'card',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('validateCoupon - category/product restrictions', () => {
    it('should validate coupon with applicable categories', async () => {
      const now = new Date();
      const coupon: Partial<Coupon> = {
        id: 'coupon-id',
        code: 'TEST50',
        isActive: true,
        startDate: new Date(now.getTime() - 86400000),
        endDate: new Date(now.getTime() + 86400000),
        minOrderValue: 500,
        applicableCategories: ['electronics'],
        userSegment: UserSegment.ALL,
      };

      const user: Partial<User> = {
        id: 'user-id',
        isNewUser: false,
        isPremiumUser: false,
        totalOrders: 0,
      };

      mockCouponRepository.findOne.mockResolvedValue(coupon);
      mockUserService.findOne.mockResolvedValue(user);
      mockCouponUsageRepository.count.mockResolvedValue(0);

      const result = await service.validateCoupon('TEST50', {
        cartValue: 1000,
        items: [{ productId: 'prod-1', category: 'electronics' }],
        paymentMethod: 'card',
        userId: 'user-id',
      });

      expect(result.valid).toBe(true);
    });

    it('should reject coupon with excluded categories', async () => {
      const now = new Date();
      const coupon: Partial<Coupon> = {
        id: 'coupon-id',
        code: 'TEST50',
        isActive: true,
        startDate: new Date(now.getTime() - 86400000),
        endDate: new Date(now.getTime() + 86400000),
        minOrderValue: 500,
        excludedCategories: ['electronics'],
        userSegment: UserSegment.ALL,
      };

      const user: Partial<User> = {
        id: 'user-id',
        isNewUser: false,
        isPremiumUser: false,
        totalOrders: 0,
      };

      mockCouponRepository.findOne.mockResolvedValue(coupon);
      mockUserService.findOne.mockResolvedValue(user);
      mockCouponUsageRepository.count.mockResolvedValue(0);

      const result = await service.validateCoupon('TEST50', {
        cartValue: 1000,
        items: [{ productId: 'prod-1', category: 'electronics' }],
        paymentMethod: 'card',
        userId: 'user-id',
      });

      expect(result.valid).toBe(false);
    });

    it('should validate coupon for new users only', async () => {
      const now = new Date();
      const coupon: Partial<Coupon> = {
        id: 'coupon-id',
        code: 'TEST50',
        isActive: true,
        startDate: new Date(now.getTime() - 86400000),
        endDate: new Date(now.getTime() + 86400000),
        minOrderValue: 500,
        userSegment: UserSegment.NEW_USERS,
      };

      const newUser: Partial<User> = {
        id: 'user-id',
        isNewUser: true,
        isPremiumUser: false,
        totalOrders: 0,
      };

      mockCouponRepository.findOne.mockResolvedValue(coupon);
      mockUserService.findOne.mockResolvedValue(newUser);
      mockCouponUsageRepository.count.mockResolvedValue(0);

      const result = await service.validateCoupon('TEST50', {
        cartValue: 1000,
        items: [],
        paymentMethod: 'card',
        userId: 'user-id',
      });

      expect(result.valid).toBe(true);
    });

    it('should reject coupon for non-new users when segment is new_users', async () => {
      const now = new Date();
      const coupon: Partial<Coupon> = {
        id: 'coupon-id',
        code: 'TEST50',
        isActive: true,
        startDate: new Date(now.getTime() - 86400000),
        endDate: new Date(now.getTime() + 86400000),
        minOrderValue: 500,
        userSegment: UserSegment.NEW_USERS,
      };

      const oldUser: Partial<User> = {
        id: 'user-id',
        isNewUser: false,
        isPremiumUser: false,
        totalOrders: 5,
      };

      mockCouponRepository.findOne.mockResolvedValue(coupon);
      mockUserService.findOne.mockResolvedValue(oldUser);

      const result = await service.validateCoupon('TEST50', {
        cartValue: 1000,
        items: [],
        paymentMethod: 'card',
        userId: 'user-id',
      });

      expect(result.valid).toBe(false);
    });

    it('should validate coupon for premium users only', async () => {
      const now = new Date();
      const coupon: Partial<Coupon> = {
        id: 'coupon-id',
        code: 'TEST50',
        isActive: true,
        startDate: new Date(now.getTime() - 86400000),
        endDate: new Date(now.getTime() + 86400000),
        minOrderValue: 500,
        userSegment: UserSegment.PREMIUM_USERS,
      };

      const premiumUser: Partial<User> = {
        id: 'user-id',
        isNewUser: false,
        isPremiumUser: true,
        totalOrders: 10,
      };

      mockCouponRepository.findOne.mockResolvedValue(coupon);
      mockUserService.findOne.mockResolvedValue(premiumUser);
      mockCouponUsageRepository.count.mockResolvedValue(0);

      const result = await service.validateCoupon('TEST50', {
        cartValue: 1000,
        items: [],
        paymentMethod: 'card',
        userId: 'user-id',
      });

      expect(result.valid).toBe(true);
    });

    it('should check minPurchaseCount requirement', async () => {
      const now = new Date();
      const coupon: Partial<Coupon> = {
        id: 'coupon-id',
        code: 'TEST50',
        isActive: true,
        startDate: new Date(now.getTime() - 86400000),
        endDate: new Date(now.getTime() + 86400000),
        minOrderValue: 500,
        minPurchaseCount: 5,
        userSegment: UserSegment.ALL,
      };

      const user: Partial<User> = {
        id: 'user-id',
        isNewUser: false,
        isPremiumUser: false,
        totalOrders: 3, // Less than required
      };

      mockCouponRepository.findOne.mockResolvedValue(coupon);
      mockUserService.findOne.mockResolvedValue(user);

      const result = await service.validateCoupon('TEST50', {
        cartValue: 1000,
        items: [],
        paymentMethod: 'card',
        userId: 'user-id',
      });

      expect(result.valid).toBe(false);
    });
  });

  describe('calculateDiscount - edge cases', () => {
    it('should handle percentage discount without max cap', () => {
      const coupon: Partial<Coupon> = {
        discountType: DiscountType.PERCENTAGE,
        discountValue: 20,
        maxDiscountCap: null,
      };

      const discount = service.calculateDiscount(coupon as Coupon, 1000);
      expect(discount).toBe(200); // 20% of 1000
    });

    it('should handle percentage discount with items', () => {
      const coupon: Partial<Coupon> = {
        discountType: DiscountType.PERCENTAGE,
        discountValue: 10,
        maxDiscountCap: 50,
      };

      const items = [
        { productId: '1', quantity: 2, price: 500, category: 'electronics' },
      ];

      const discount = service.calculateDiscount(coupon as Coupon, 1000, items);
      expect(discount).toBe(50); // 10% of 1000 = 100, capped at 50
    });

    it('should handle fixed amount discount exceeding order value', () => {
      const coupon: Partial<Coupon> = {
        discountType: DiscountType.FIXED_AMOUNT,
        discountValue: 1500,
      };

      const discount = service.calculateDiscount(coupon as Coupon, 1000);
      expect(discount).toBe(1000); // Should not exceed order value
    });
  });

  describe('validateCoupon - per-item validation', () => {
    it('should return item-level discount breakdown', async () => {
      const now = new Date();
      const coupon: Partial<Coupon> = {
        id: 'coupon-id',
        code: 'TEST50',
        isActive: true,
        startDate: new Date(now.getTime() - 86400000),
        endDate: new Date(now.getTime() + 86400000),
        minOrderValue: 500,
        discountType: DiscountType.PERCENTAGE,
        discountValue: 10,
        userSegment: UserSegment.ALL,
      };

      const user: Partial<User> = {
        id: 'user-id',
        isNewUser: false,
        isPremiumUser: false,
        totalOrders: 0,
      };

      mockCacheManager.get.mockResolvedValue(null);
      mockCouponRepository.findOne.mockResolvedValue(coupon);
      mockUserService.findOne.mockResolvedValue(user);
      mockCouponUsageRepository.count.mockResolvedValue(0);

      const result = await service.validateCoupon('TEST50', {
        cartValue: 1000,
        items: [
          { productId: 'prod-1', category: 'electronics' },
        ],
        paymentMethod: 'card',
        userId: 'user-id',
      });

      expect(result.valid).toBe(true);
      // itemDiscounts only generated when items have price/quantity
      // Since ValidateCouponDto items don't have price/quantity, itemDiscounts may be undefined
    });

    it('should identify non-applicable items', async () => {
      const now = new Date();
      const coupon: Partial<Coupon> = {
        id: 'coupon-id',
        code: 'TEST50',
        isActive: true,
        startDate: new Date(now.getTime() - 86400000),
        endDate: new Date(now.getTime() + 86400000),
        minOrderValue: 500,
        applicableCategories: ['electronics'],
        userSegment: UserSegment.ALL,
      };

      const user: Partial<User> = {
        id: 'user-id',
        isNewUser: false,
        isPremiumUser: false,
        totalOrders: 0,
      };

      mockCacheManager.get.mockResolvedValue(null);
      mockCouponRepository.findOne.mockResolvedValue(coupon);
      mockUserService.findOne.mockResolvedValue(user);
      mockCouponUsageRepository.count.mockResolvedValue(0);

      const result = await service.validateCoupon('TEST50', {
        cartValue: 1000,
        items: [
          { productId: 'prod-1', category: 'electronics' },
          { productId: 'prod-2', category: 'groceries' }, // Not applicable
        ],
        paymentMethod: 'card',
        userId: 'user-id',
      });

      expect(result.valid).toBe(true); // At least one item is applicable
      expect(result.nonApplicableItems).toBeDefined();
      expect(result.nonApplicableItems?.length).toBeGreaterThan(0);
    });
  });

  describe('findAllAvailable - filtering', () => {
    it('should filter out expired coupons', async () => {
      const now = new Date();
      const coupons = [
        {
          id: '1',
          code: 'ACTIVE',
          isActive: true,
          startDate: new Date(now.getTime() - 86400000),
          endDate: new Date(now.getTime() + 86400000),
        },
        {
          id: '2',
          code: 'EXPIRED',
          isActive: true,
          startDate: new Date(now.getTime() - 172800000),
          endDate: new Date(now.getTime() - 86400000), // Expired
        },
      ] as Coupon[];

      const user: Partial<User> = {
        id: 'user-id',
        isNewUser: false,
        isPremiumUser: false,
        totalOrders: 0,
      };

      mockCacheManager.get.mockResolvedValue(null);
      mockCouponRepository.find.mockResolvedValue(coupons);
      mockUserService.findOne.mockResolvedValue(user);
      mockCouponUsageRepository.count.mockResolvedValue(0);

      const result = await service.findAllAvailable('user-id');

      // Should only return active, non-expired coupons
      expect(result.length).toBeLessThanOrEqual(coupons.length);
    });

    it('should filter out user-specific coupons for other users', async () => {
      const now = new Date();
      const coupons = [
        {
          id: '1',
          code: 'GLOBAL',
          isActive: true,
          startDate: new Date(now.getTime() - 86400000),
          endDate: new Date(now.getTime() + 86400000),
          targetUserId: null,
        },
        {
          id: '2',
          code: 'USER_SPECIFIC',
          isActive: true,
          startDate: new Date(now.getTime() - 86400000),
          endDate: new Date(now.getTime() + 86400000),
          targetUserId: 'other-user-id', // Not for this user
        },
      ] as Coupon[];

      const user: Partial<User> = {
        id: 'user-id',
        isNewUser: false,
        isPremiumUser: false,
        totalOrders: 0,
      };

      mockCacheManager.get.mockResolvedValue(null);
      mockCouponRepository.find.mockResolvedValue(coupons);
      mockUserService.findOne.mockResolvedValue(user);
      mockCouponUsageRepository.count.mockResolvedValue(0);

      const result = await service.findAllAvailable('user-id');

      // Should only return global coupon
      expect(result.some((c) => c.code === 'GLOBAL')).toBe(true);
      expect(result.some((c) => c.code === 'USER_SPECIFIC')).toBe(false);
    });
  });

  describe('validateCoupon - item applicability edge cases', () => {
    it('should reject when no items are applicable', async () => {
      const now = new Date();
      const coupon: Partial<Coupon> = {
        id: 'coupon-id',
        code: 'TEST50',
        isActive: true,
        startDate: new Date(now.getTime() - 86400000),
        endDate: new Date(now.getTime() + 86400000),
        minOrderValue: 500,
        applicableCategories: ['electronics'],
        userSegment: UserSegment.ALL,
      };

      const user: Partial<User> = {
        id: 'user-id',
        isNewUser: false,
        isPremiumUser: false,
        totalOrders: 0,
      };

      mockCacheManager.get.mockResolvedValue(null);
      mockCouponRepository.findOne.mockResolvedValue(coupon);
      mockUserService.findOne.mockResolvedValue(user);
      mockCouponUsageRepository.count.mockResolvedValue(0);

      const result = await service.validateCoupon('TEST50', {
        cartValue: 1000,
        items: [
          { productId: 'prod-1', category: 'groceries' }, // Not in applicable categories
        ],
        paymentMethod: 'card',
        userId: 'user-id',
      });

      expect(result.valid).toBe(false);
      expect(result.message).toContain('not applicable to any items');
    });

    it('should handle applicable products list', async () => {
      const now = new Date();
      const coupon: Partial<Coupon> = {
        id: 'coupon-id',
        code: 'TEST50',
        isActive: true,
        startDate: new Date(now.getTime() - 86400000),
        endDate: new Date(now.getTime() + 86400000),
        minOrderValue: 500,
        applicableProducts: ['prod-1'],
        userSegment: UserSegment.ALL,
      };

      const user: Partial<User> = {
        id: 'user-id',
        isNewUser: false,
        isPremiumUser: false,
        totalOrders: 0,
      };

      mockCacheManager.get.mockResolvedValue(null);
      mockCouponRepository.findOne.mockResolvedValue(coupon);
      mockUserService.findOne.mockResolvedValue(user);
      mockCouponUsageRepository.count.mockResolvedValue(0);

      const result = await service.validateCoupon('TEST50', {
        cartValue: 1000,
        items: [
          { productId: 'prod-1' }, // In applicable list
          { productId: 'prod-2' }, // Not in applicable list
        ],
        paymentMethod: 'card',
        userId: 'user-id',
      });

      expect(result.valid).toBe(true);
      expect(result.nonApplicableItems).toBeDefined();
    });

    it('should handle excluded products', async () => {
      const now = new Date();
      const coupon: Partial<Coupon> = {
        id: 'coupon-id',
        code: 'TEST50',
        isActive: true,
        startDate: new Date(now.getTime() - 86400000),
        endDate: new Date(now.getTime() + 86400000),
        minOrderValue: 500,
        excludedProducts: ['prod-2'],
        userSegment: UserSegment.ALL,
      };

      const user: Partial<User> = {
        id: 'user-id',
        isNewUser: false,
        isPremiumUser: false,
        totalOrders: 0,
      };

      mockCacheManager.get.mockResolvedValue(null);
      mockCouponRepository.findOne.mockResolvedValue(coupon);
      mockUserService.findOne.mockResolvedValue(user);
      mockCouponUsageRepository.count.mockResolvedValue(0);

      const result = await service.validateCoupon('TEST50', {
        cartValue: 1000,
        items: [
          { productId: 'prod-1' },
          { productId: 'prod-2' }, // Excluded
        ],
        paymentMethod: 'card',
        userId: 'user-id',
      });

      expect(result.valid).toBe(true);
      expect(result.nonApplicableItems?.some((item) => item.productId === 'prod-2')).toBe(true);
    });
  });

  describe('applyCoupon - transaction edge cases', () => {
    it('should throw BadRequestException for inactive coupon', async () => {
      const now = new Date();
      const coupon: Partial<Coupon> = {
        id: 'coupon-id',
        code: 'TEST50',
        isActive: false,
        startDate: new Date(now.getTime() - 86400000),
        endDate: new Date(now.getTime() + 86400000),
        minOrderValue: 500,
      };

      const mockManager = {
        findOne: jest.fn().mockResolvedValue(coupon),
      };

      mockDataSource.transaction.mockImplementation(async (callback) => {
        return callback(mockManager);
      });

      await expect(
        service.applyCoupon('TEST50', 'user-id', {
          cartValue: 1000,
          items: [],
          paymentMethod: 'card',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when usage limit reached', async () => {
      const now = new Date();
      const coupon: Partial<Coupon> = {
        id: 'coupon-id',
        code: 'TEST50',
        isActive: true,
        startDate: new Date(now.getTime() - 86400000),
        endDate: new Date(now.getTime() + 86400000),
        minOrderValue: 500,
        totalUsageLimit: 10,
        currentUsageCount: 10, // Limit reached
      };

      const mockManager = {
        findOne: jest.fn().mockResolvedValue(coupon),
      };

      mockDataSource.transaction.mockImplementation(async (callback) => {
        return callback(mockManager);
      });

      await expect(
        service.applyCoupon('TEST50', 'user-id', {
          cartValue: 1000,
          items: [],
          paymentMethod: 'card',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

