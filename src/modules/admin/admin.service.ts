import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Like } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Coupon, DiscountType, UserSegment } from '../../entities/coupon.entity';
import { CouponUsage, CouponUsageStatus } from '../../entities/coupon-usage.entity';
import { Order } from '../../entities/order.entity';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { CouponService } from '../coupon/coupon.service';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Coupon)
    private couponRepository: Repository<Coupon>,
    @InjectRepository(CouponUsage)
    private couponUsageRepository: Repository<CouponUsage>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private couponService: CouponService,
  ) {}

  async createCoupon(createCouponDto: CreateCouponDto, createdBy: string): Promise<Coupon> {
    // Check for unique code
    const existingCoupon = await this.couponRepository.findOne({
      where: { code: createCouponDto.code.toUpperCase() },
    });

    if (existingCoupon) {
      throw new ConflictException('Coupon code already exists');
    }

    // Validate date range
    if (createCouponDto.startDate >= createCouponDto.endDate) {
      throw new BadRequestException('Start date must be before end date');
    }

    // Validate discount rules
    if (createCouponDto.discountType === DiscountType.PERCENTAGE) {
      if (createCouponDto.discountValue < 1 || createCouponDto.discountValue > 100) {
        throw new BadRequestException('Percentage discount must be between 1 and 100');
      }
      if (!createCouponDto.maxDiscountCap) {
        throw new BadRequestException('Max discount cap is required for percentage discounts');
      }
    }

    if (createCouponDto.discountType === DiscountType.FIXED_AMOUNT) {
      if (createCouponDto.discountValue <= 0) {
        throw new BadRequestException('Fixed amount discount must be positive');
      }
    }

    // Validate usage limits
    if (
      createCouponDto.totalUsageLimit &&
      createCouponDto.perUserLimit &&
      createCouponDto.totalUsageLimit < createCouponDto.perUserLimit
    ) {
      throw new BadRequestException('Total usage limit must be >= per user limit');
    }

    // Validate category overlap: categories cannot be in both applicable and excluded
    if (
      createCouponDto.applicableCategories &&
      createCouponDto.excludedCategories &&
      createCouponDto.applicableCategories.length > 0 &&
      createCouponDto.excludedCategories.length > 0
    ) {
      const overlap = createCouponDto.applicableCategories.filter((cat) =>
        createCouponDto.excludedCategories?.includes(cat),
      );
      if (overlap.length > 0) {
        throw new BadRequestException(
          `Categories cannot be in both applicable and excluded lists: ${overlap.join(', ')}`,
        );
      }
    }

    // Validate product overlap: products cannot be in both applicable and excluded
    if (
      createCouponDto.applicableProducts &&
      createCouponDto.excludedProducts &&
      createCouponDto.applicableProducts.length > 0 &&
      createCouponDto.excludedProducts.length > 0
    ) {
      const overlap = createCouponDto.applicableProducts.filter((prod) =>
        createCouponDto.excludedProducts?.includes(prod),
      );
      if (overlap.length > 0) {
        throw new BadRequestException(
          `Products cannot be in both applicable and excluded lists: ${overlap.join(', ')}`,
        );
      }
    }

    const coupon = this.couponRepository.create({
      ...createCouponDto,
      code: createCouponDto.code.toUpperCase(),
      createdBy,
    });

    const savedCoupon = await this.couponRepository.save(coupon);
    
    // Invalidate analytics caches when new coupon is created
    await this.invalidateAnalyticsCache();
    
    return savedCoupon;
  }

  async findAll(filters?: {
    isActive?: boolean;
    discountType?: DiscountType;
    userSegment?: UserSegment;
    search?: string;
  }): Promise<Coupon[]> {
    const query = this.couponRepository.createQueryBuilder('coupon');

    if (filters?.isActive !== undefined) {
      query.andWhere('coupon.isActive = :isActive', { isActive: filters.isActive });
    }

    if (filters?.discountType) {
      query.andWhere('coupon.discountType = :discountType', {
        discountType: filters.discountType,
      });
    }

    if (filters?.userSegment) {
      query.andWhere('coupon.userSegment = :userSegment', {
        userSegment: filters.userSegment,
      });
    }

    if (filters?.search) {
      query.andWhere(
        '(coupon.code LIKE :search OR coupon.title LIKE :search OR coupon.description LIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    return query.orderBy('coupon.createdAt', 'DESC').getMany();
  }

  async findOne(id: string): Promise<Coupon> {
    const coupon = await this.couponRepository.findOne({ where: { id } });
    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }
    return coupon;
  }

  async updateCoupon(id: string, updateCouponDto: UpdateCouponDto): Promise<Coupon> {
    const coupon = await this.findOne(id);

    // Validate date range if dates are being updated
    if (updateCouponDto.startDate && updateCouponDto.endDate) {
      if (updateCouponDto.startDate >= updateCouponDto.endDate) {
        throw new BadRequestException('Start date must be before end date');
      }
    }

    // Validate category overlap: categories cannot be in both applicable and excluded
    const finalApplicableCategories =
      updateCouponDto.applicableCategories !== undefined
        ? updateCouponDto.applicableCategories
        : coupon.applicableCategories || [];
    const finalExcludedCategories =
      updateCouponDto.excludedCategories !== undefined
        ? updateCouponDto.excludedCategories
        : coupon.excludedCategories || [];

    if (finalApplicableCategories.length > 0 && finalExcludedCategories.length > 0) {
      const overlap = finalApplicableCategories.filter((cat) =>
        finalExcludedCategories.includes(cat),
      );
      if (overlap.length > 0) {
        throw new BadRequestException(
          `Categories cannot be in both applicable and excluded lists: ${overlap.join(', ')}`,
        );
      }
    }

    // Validate product overlap: products cannot be in both applicable and excluded
    const finalApplicableProducts =
      updateCouponDto.applicableProducts !== undefined
        ? updateCouponDto.applicableProducts
        : coupon.applicableProducts || [];
    const finalExcludedProducts =
      updateCouponDto.excludedProducts !== undefined
        ? updateCouponDto.excludedProducts
        : coupon.excludedProducts || [];

    if (finalApplicableProducts.length > 0 && finalExcludedProducts.length > 0) {
      const overlap = finalApplicableProducts.filter((prod) =>
        finalExcludedProducts.includes(prod),
      );
      if (overlap.length > 0) {
        throw new BadRequestException(
          `Products cannot be in both applicable and excluded lists: ${overlap.join(', ')}`,
        );
      }
    }

    // Check for unique code if code is being updated
    if (updateCouponDto.code) {
      const existingCoupon = await this.couponRepository.findOne({
        where: { code: updateCouponDto.code.toUpperCase() },
      });
      if (existingCoupon && existingCoupon.id !== id) {
        throw new ConflictException('Coupon code already exists');
      }
      updateCouponDto.code = updateCouponDto.code.toUpperCase();
    }

    Object.assign(coupon, updateCouponDto);
    const updatedCoupon = await this.couponRepository.save(coupon);
    
    // Invalidate caches when coupon is updated
    await this.cacheManager.del(`coupon_${coupon.code}`);
    await this.cacheManager.del(`analytics_coupon_${id}`);
    await this.invalidateAnalyticsCache();
    
    return updatedCoupon;
  }

  async toggleStatus(id: string): Promise<Coupon> {
    const coupon = await this.findOne(id);
    coupon.isActive = !coupon.isActive;
    const updatedCoupon = await this.couponRepository.save(coupon);
    
    // Invalidate caches when coupon status changes
    await this.cacheManager.del(`coupon_${coupon.code}`);
    await this.cacheManager.del(`analytics_coupon_${id}`);
    await this.invalidateAnalyticsCache();
    
    return updatedCoupon;
  }

  async deleteCoupon(id: string): Promise<void> {
    const coupon = await this.findOne(id);
    // Soft delete by setting isActive to false
    coupon.isActive = false;
    await this.couponRepository.save(coupon);
  }

  async getCouponAnalytics(id: string): Promise<any> {
    const cacheKey = `analytics_coupon_${id}`;
    const cached = await this.cacheManager.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    const coupon = await this.findOne(id);

    const usages = await this.couponUsageRepository.find({
      where: { couponId: id },
    });

    const totalUsage = usages.length;
    const totalDiscountGiven = usages.reduce(
      (sum, usage) => sum + Number(usage.discountApplied),
      0,
    );
    const totalRevenue = usages.reduce(
      (sum, usage) => sum + Number(usage.finalOrderValue),
      0,
    );

    const activeUsages = usages.filter(
      (usage) => usage.status === CouponUsageStatus.APPLIED,
    ).length;

    const refundedUsages = usages.filter(
      (usage) => usage.status === CouponUsageStatus.REFUNDED,
    ).length;

    // Usage over time (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentUsages = usages.filter(
      (usage) => new Date(usage.usedAt) >= thirtyDaysAgo,
    );

    const analytics = {
      coupon: {
        id: coupon.id,
        code: coupon.code,
        title: coupon.title,
        isActive: coupon.isActive,
      },
      metrics: {
        totalUsage,
        activeUsages,
        refundedUsages,
        totalDiscountGiven,
        totalRevenue,
        averageDiscount: totalUsage > 0 ? totalDiscountGiven / totalUsage : 0,
        usageRate:
          coupon.totalUsageLimit
            ? (activeUsages / coupon.totalUsageLimit) * 100
            : null,
      },
      recentActivity: {
        last30Days: recentUsages.length,
        trend: this.calculateTrend(recentUsages),
      },
    };

    // Cache for 15 minutes
    await this.cacheManager.set(cacheKey, analytics, 900);
    return analytics;
  }

  async getCouponUsageReport(filters?: {
    startDate?: Date;
    endDate?: Date;
    couponId?: string;
  }): Promise<any> {
    const query = this.couponUsageRepository.createQueryBuilder('usage');

    if (filters?.startDate && filters?.endDate) {
      query.andWhere('usage.usedAt BETWEEN :startDate AND :endDate', {
        startDate: filters.startDate,
        endDate: filters.endDate,
      });
    }

    if (filters?.couponId) {
      query.andWhere('usage.couponId = :couponId', { couponId: filters.couponId });
    }

    const usages = await query
      .leftJoinAndSelect('usage.coupon', 'coupon')
      .leftJoinAndSelect('usage.user', 'user')
      .orderBy('usage.usedAt', 'DESC')
      .getMany();

    return {
      totalRecords: usages.length,
      totalDiscountGiven: usages.reduce(
        (sum, usage) => sum + Number(usage.discountApplied),
        0,
      ),
      totalRevenue: usages.reduce((sum, usage) => sum + Number(usage.finalOrderValue), 0),
      usages: usages.map((usage) => ({
        id: usage.id,
        couponCode: usage.coupon.code,
        userId: usage.userId,
        discountApplied: usage.discountApplied,
        orderValue: usage.orderValue,
        finalOrderValue: usage.finalOrderValue,
        status: usage.status,
        usedAt: usage.usedAt,
      })),
    };
  }

  async getTopCoupons(limit: number = 10): Promise<any> {
    const cacheKey = `analytics_top_coupons_${limit}`;
    const cached = await this.cacheManager.get<any[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const topCoupons = await this.couponUsageRepository
      .createQueryBuilder('usage')
      .select('usage.couponId', 'couponId')
      .addSelect('COUNT(usage.id)', 'usageCount')
      .addSelect('SUM(usage.discountApplied)', 'totalDiscount')
      .addSelect('SUM(usage.finalOrderValue)', 'totalRevenue')
      .where('usage.status = :status', { status: CouponUsageStatus.APPLIED })
      .groupBy('usage.couponId')
      .orderBy('COUNT(usage.id)', 'DESC')
      .limit(limit)
      .getRawMany();

    const coupons = await Promise.all(
      topCoupons.map(async (item) => {
        const coupon = await this.couponRepository.findOne({
          where: { id: item.couponId },
        });
        return {
          coupon: coupon
            ? {
                id: coupon.id,
                code: coupon.code,
                title: coupon.title,
              }
            : null,
          usageCount: parseInt(item.usageCount),
          totalDiscount: parseFloat(item.totalDiscount || 0),
          totalRevenue: parseFloat(item.totalRevenue || 0),
        };
      }),
    );

    // Cache for 30 minutes
    await this.cacheManager.set(cacheKey, coupons, 1800);
    return coupons;
  }

  async getRevenueImpact(filters?: {
    startDate?: Date;
    endDate?: Date;
  }): Promise<any> {
    // Create cache key based on filters
    const dateKey = filters?.startDate && filters?.endDate
      ? `${filters.startDate.toISOString()}_${filters.endDate.toISOString()}`
      : 'all';
    const cacheKey = `analytics_revenue_${dateKey}`;
    
    const cached = await this.cacheManager.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    const query = this.couponUsageRepository.createQueryBuilder('usage');

    if (filters?.startDate && filters?.endDate) {
      query.andWhere('usage.usedAt BETWEEN :startDate AND :endDate', {
        startDate: filters.startDate,
        endDate: filters.endDate,
      });
    }

    query.andWhere('usage.status = :status', { status: CouponUsageStatus.APPLIED });

    const usages = await query.getMany();

    const totalDiscountGiven = usages.reduce(
      (sum, usage) => sum + Number(usage.discountApplied),
      0,
    );
    const totalRevenue = usages.reduce(
      (sum, usage) => sum + Number(usage.finalOrderValue),
      0,
    );
    const totalOrderValue = usages.reduce(
      (sum, usage) => sum + Number(usage.orderValue),
      0,
    );

    const revenueImpact = {
      totalOrders: usages.length,
      totalOrderValue,
      totalDiscountGiven,
      totalRevenue,
      discountPercentage: totalOrderValue > 0 ? (totalDiscountGiven / totalOrderValue) * 100 : 0,
      averageDiscountPerOrder: usages.length > 0 ? totalDiscountGiven / usages.length : 0,
      averageOrderValue: usages.length > 0 ? totalOrderValue / usages.length : 0,
    };

    // Cache for 30 minutes
    await this.cacheManager.set(cacheKey, revenueImpact, 1800);
    return revenueImpact;
  }

  /**
   * Invalidate analytics caches (top coupons, revenue impact)
   * Call this when coupon usage changes
   */
  private async invalidateAnalyticsCache(): Promise<void> {
    // Invalidate top coupons (all limit variations)
    const topCouponKeys = ['analytics_top_coupons_5', 'analytics_top_coupons_10', 'analytics_top_coupons_20'];
    for (const key of topCouponKeys) {
      await this.cacheManager.del(key);
    }
    
    // Invalidate revenue impact (all date variations)
    // Note: We can't easily invalidate all date variations, so we rely on TTL
    // For specific date ranges, they will expire naturally
  }

  /**
   * Invalidate coupon analytics cache
   * Call this when a specific coupon is used
   */
  async invalidateCouponAnalytics(couponId: string): Promise<void> {
    await this.cacheManager.del(`analytics_coupon_${couponId}`);
    await this.invalidateAnalyticsCache();
  }

  private calculateTrend(usages: CouponUsage[]): 'increasing' | 'decreasing' | 'stable' {
    if (usages.length < 2) return 'stable';

    const sorted = usages.sort(
      (a, b) => new Date(a.usedAt).getTime() - new Date(b.usedAt).getTime(),
    );
    const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2));
    const secondHalf = sorted.slice(Math.floor(sorted.length / 2));

    const firstAvg = firstHalf.length;
    const secondAvg = secondHalf.length;

    if (secondAvg > firstAvg * 1.1) return 'increasing';
    if (secondAvg < firstAvg * 0.9) return 'decreasing';
    return 'stable';
  }
}

