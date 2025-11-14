import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Repository } from 'typeorm';
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { Coupon, DiscountType, UserSegment } from '../../entities/coupon.entity';
import { CouponUsage, CouponUsageStatus } from '../../entities/coupon-usage.entity';
import { Order } from '../../entities/order.entity';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { CouponService } from '../coupon/coupon.service';

describe('AdminService', () => {
  let service: AdminService;
  let couponRepository: Repository<Coupon>;
  let couponUsageRepository: Repository<CouponUsage>;
  let orderRepository: Repository<Order>;
  let couponService: CouponService;

  const mockCouponRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockCouponUsageRepository = {
    createQueryBuilder: jest.fn(),
    find: jest.fn(),
  };

  const mockOrderRepository = {
    createQueryBuilder: jest.fn(),
  };

  const mockCacheManager = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const mockCouponService = {
    findByCode: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: getRepositoryToken(Coupon),
          useValue: mockCouponRepository,
        },
        {
          provide: getRepositoryToken(CouponUsage),
          useValue: mockCouponUsageRepository,
        },
        {
          provide: getRepositoryToken(Order),
          useValue: mockOrderRepository,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
        {
          provide: CouponService,
          useValue: mockCouponService,
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    couponRepository = module.get<Repository<Coupon>>(getRepositoryToken(Coupon));
    couponUsageRepository = module.get<Repository<CouponUsage>>(
      getRepositoryToken(CouponUsage),
    );
    orderRepository = module.get<Repository<Order>>(getRepositoryToken(Order));
    couponService = module.get<CouponService>(CouponService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createCoupon', () => {
    it('should create coupon successfully', async () => {
      const createCouponDto: CreateCouponDto = {
        code: 'TEST50',
        title: 'Test Coupon',
        description: 'Test description',
        discountType: DiscountType.PERCENTAGE,
        discountValue: 50,
        minOrderValue: 500,
        maxDiscountCap: 200,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        isActive: true,
      };

      mockCouponRepository.findOne.mockResolvedValue(null);
      mockCouponRepository.create.mockReturnValue({
        id: 'coupon-id',
        ...createCouponDto,
        createdBy: 'admin-id',
      });
      mockCouponRepository.save.mockResolvedValue({
        id: 'coupon-id',
        ...createCouponDto,
        createdBy: 'admin-id',
      });

      const result = await service.createCoupon(createCouponDto, 'admin-id');

      expect(result).toBeDefined();
      expect(result.code).toBe('TEST50');
      expect(mockCouponRepository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException for duplicate code', async () => {
      const createCouponDto: CreateCouponDto = {
        code: 'EXISTING',
        title: 'Test Coupon',
        description: 'Test description',
        discountType: DiscountType.PERCENTAGE,
        discountValue: 50,
        minOrderValue: 500,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        isActive: true,
      };

      mockCouponRepository.findOne.mockResolvedValue({ id: 'existing-id' });

      await expect(service.createCoupon(createCouponDto, 'admin-id')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw BadRequestException for invalid date range', async () => {
      const createCouponDto: CreateCouponDto = {
        code: 'TEST50',
        title: 'Test Coupon',
        description: 'Test description',
        discountType: DiscountType.PERCENTAGE,
        discountValue: 50,
        minOrderValue: 500,
        startDate: new Date('2024-12-31'),
        endDate: new Date('2024-01-01'), // End before start
        isActive: true,
      };

      mockCouponRepository.findOne.mockResolvedValue(null);

      await expect(service.createCoupon(createCouponDto, 'admin-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for invalid percentage', async () => {
      const createCouponDto: CreateCouponDto = {
        code: 'TEST50',
        title: 'Test Coupon',
        description: 'Test description',
        discountType: DiscountType.PERCENTAGE,
        discountValue: 150, // Invalid: > 100
        minOrderValue: 500,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        isActive: true,
      };

      mockCouponRepository.findOne.mockResolvedValue(null);

      await expect(service.createCoupon(createCouponDto, 'admin-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for overlapping categories', async () => {
      const createCouponDto: CreateCouponDto = {
        code: 'TEST50',
        title: 'Test Coupon',
        description: 'Test description',
        discountType: DiscountType.PERCENTAGE,
        discountValue: 50,
        minOrderValue: 500,
        maxDiscountCap: 200,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        isActive: true,
        applicableCategories: ['electronics', 'groceries'],
        excludedCategories: ['electronics'], // Overlap with applicable
      };

      mockCouponRepository.findOne.mockResolvedValue(null);

      await expect(service.createCoupon(createCouponDto, 'admin-id')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createCoupon(createCouponDto, 'admin-id')).rejects.toThrow(
        'Categories cannot be in both applicable and excluded lists',
      );
    });

    it('should throw BadRequestException for overlapping products', async () => {
      const createCouponDto: CreateCouponDto = {
        code: 'TEST50',
        title: 'Test Coupon',
        description: 'Test description',
        discountType: DiscountType.PERCENTAGE,
        discountValue: 50,
        minOrderValue: 500,
        maxDiscountCap: 200,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        isActive: true,
        applicableProducts: ['prod-1', 'prod-2'],
        excludedProducts: ['prod-1'], // Overlap with applicable
      };

      mockCouponRepository.findOne.mockResolvedValue(null);

      await expect(service.createCoupon(createCouponDto, 'admin-id')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createCoupon(createCouponDto, 'admin-id')).rejects.toThrow(
        'Products cannot be in both applicable and excluded lists',
      );
    });
  });

  describe('findAll', () => {
    it('should return all coupons', async () => {
      const mockQueryBuilder = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { id: '1', code: 'TEST1' },
          { id: '2', code: 'TEST2' },
        ]),
      };

      mockCouponRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.findAll();

      expect(result).toBeDefined();
      expect(mockQueryBuilder.getMany).toHaveBeenCalled();
    });

    it('should filter by isActive', async () => {
      const mockQueryBuilder = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([{ id: '1', code: 'TEST1', isActive: true }]),
      };

      mockCouponRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.findAll({ isActive: true });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return coupon by id', async () => {
      const coupon = { id: 'coupon-id', code: 'TEST50' } as Coupon;

      mockCouponRepository.findOne.mockResolvedValue(coupon);

      const result = await service.findOne('coupon-id');

      expect(result).toEqual(coupon);
    });

    it('should throw NotFoundException if coupon not found', async () => {
      mockCouponRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateCoupon', () => {
    it('should update coupon successfully', async () => {
      const existingCoupon = {
        id: 'coupon-id',
        code: 'TEST50',
        title: 'Old Title',
      } as Coupon;

      const updateDto: UpdateCouponDto = {
        title: 'New Title',
      };

      mockCouponRepository.findOne.mockResolvedValue(existingCoupon);
      mockCouponRepository.save.mockResolvedValue({
        ...existingCoupon,
        ...updateDto,
      });

      const result = await service.updateCoupon('coupon-id', updateDto);

      expect(result.title).toBe('New Title');
    });
  });

  describe('deleteCoupon', () => {
    it('should soft delete coupon by setting isActive to false', async () => {
      const coupon = { id: 'coupon-id', code: 'TEST50', isActive: true } as Coupon;

      mockCouponRepository.findOne.mockResolvedValue(coupon);
      mockCouponRepository.save.mockResolvedValue({ ...coupon, isActive: false });

      await service.deleteCoupon('coupon-id');

      expect(mockCouponRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });
  });

  describe('toggleStatus', () => {
    it('should toggle coupon active status', async () => {
      const coupon = { id: 'coupon-id', code: 'TEST50', isActive: true } as Coupon;

      mockCouponRepository.findOne.mockResolvedValue(coupon);
      mockCouponRepository.save.mockResolvedValue({ ...coupon, isActive: false });

      const result = await service.toggleStatus('coupon-id');

      expect(result.isActive).toBe(false);
      expect(mockCacheManager.del).toHaveBeenCalled();
    });
  });

  describe('getCouponAnalytics', () => {
    it('should return cached analytics if available', async () => {
      const cachedAnalytics = { totalUsage: 10, totalDiscount: 1000 };
      mockCacheManager.get.mockResolvedValue(cachedAnalytics);

      const result = await service.getCouponAnalytics('coupon-id');

      expect(result).toEqual(cachedAnalytics);
    });

    it('should calculate and cache analytics if not cached', async () => {
      const coupon = { id: 'coupon-id', code: 'TEST50' } as Coupon;
      const usages = [
        {
          id: '1',
          discountApplied: 100,
          finalOrderValue: 900,
          status: CouponUsageStatus.APPLIED,
          usedAt: new Date(),
        },
      ] as CouponUsage[];

      mockCacheManager.get.mockResolvedValue(null);
      mockCouponRepository.findOne.mockResolvedValue(coupon);
      mockCouponUsageRepository.find.mockResolvedValue(usages);

      const result = await service.getCouponAnalytics('coupon-id');

      expect(result).toBeDefined();
      expect(result.coupon).toBeDefined();
      expect(mockCacheManager.set).toHaveBeenCalled();
    });
  });

  describe('getTopCoupons', () => {
    it('should return cached top coupons if available', async () => {
      const cachedCoupons = [{ code: 'TEST1', usageCount: 10 }];
      mockCacheManager.get.mockResolvedValue(cachedCoupons);

      const result = await service.getTopCoupons(5);

      expect(result).toEqual(cachedCoupons);
    });

    it('should calculate and cache top coupons if not cached', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { code: 'TEST1', usageCount: 10 },
        ]),
      };

      mockCacheManager.get.mockResolvedValue(null);
      mockCouponUsageRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockCouponService.findByCode.mockResolvedValue({ id: '1', code: 'TEST1' } as Coupon);

      const result = await service.getTopCoupons(5);

      expect(result).toBeDefined();
      expect(mockCacheManager.set).toHaveBeenCalled();
    });
  });

  describe('getRevenueImpact', () => {
    it('should return cached revenue impact if available', async () => {
      const cachedImpact = { totalDiscountGiven: 5000, totalOrders: 100 };
      mockCacheManager.get.mockResolvedValue(cachedImpact);

      const result = await service.getRevenueImpact();

      expect(result).toEqual(cachedImpact);
    });

    it('should calculate and cache revenue impact if not cached', async () => {
      const mockQueryBuilder = {
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            discountApplied: 100,
            finalOrderValue: 900,
            orderValue: 1000,
          },
        ]),
      };

      mockCacheManager.get.mockResolvedValue(null);
      mockCouponUsageRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getRevenueImpact();

      expect(result).toBeDefined();
      expect(result.totalOrders).toBe(1);
      expect(mockCacheManager.set).toHaveBeenCalled();
    });
  });

  describe('getCouponUsageReport', () => {
    it('should return usage report with filters', async () => {
      const mockQueryBuilder = {
        andWhere: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: '1',
            coupon: { code: 'TEST1' },
            discountApplied: 100,
            orderValue: 1000,
            finalOrderValue: 900,
            status: CouponUsageStatus.APPLIED,
            usedAt: new Date(),
          },
        ]),
      };

      mockCouponUsageRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getCouponUsageReport({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });

      expect(result).toBeDefined();
      expect(result.totalRecords).toBe(1);
    });
  });
});

