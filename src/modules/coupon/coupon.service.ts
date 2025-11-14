import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository, MoreThanOrEqual, LessThanOrEqual, Between } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Coupon, DiscountType, UserSegment } from '../../entities/coupon.entity';
import { CouponUsage, CouponUsageStatus } from '../../entities/coupon-usage.entity';
import { User } from '../../entities/user.entity';
import { UserService } from '../user/user.service';
import { ReferralConfig } from '../../config/referral.config';

export interface ValidateCouponDto {
  cartValue: number;
  items: Array<{ productId: string; category?: string }>;
  paymentMethod: string;
  userId: string;
}

export interface ApplyCouponDto {
  cartValue: number;
  items: Array<{ productId: string; category?: string; quantity: number; price: number }>;
  paymentMethod: string;
  deliveryCharge?: number;
}

@Injectable()
export class CouponService {
  constructor(
    @InjectRepository(Coupon)
    private couponRepository: Repository<Coupon>,
    @InjectRepository(CouponUsage)
    private couponUsageRepository: Repository<CouponUsage>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectDataSource() private dataSource: DataSource,
    private userService: UserService,
  ) {}

  async findAllAvailable(userId: string): Promise<Coupon[]> {
    const cacheKey = `available_coupons_${userId}`;
    const cached = await this.cacheManager.get<Coupon[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const user = await this.userService.findOne(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const now = new Date();
    const coupons = await this.couponRepository.find({
      where: {
        isActive: true,
        startDate: LessThanOrEqual(now),
        endDate: MoreThanOrEqual(now),
      },
    });

    // Filter coupons: include general coupons + user-specific coupons for this user
    const availableCoupons = coupons.filter((coupon) => {
      // If coupon is user-specific, only include if it's for this user
      if (coupon.targetUserId) {
        return coupon.targetUserId === userId && this.isUserEligible(coupon, user);
      }
      // For general coupons, check user eligibility
      return this.isUserEligible(coupon, user);
    });

    await this.cacheManager.set(cacheKey, availableCoupons, 300); // 5 minutes cache
    return availableCoupons;
  }

  async validateCoupon(
    code: string,
    validateDto: ValidateCouponDto,
  ): Promise<{
    valid: boolean;
    discount?: number;
    message?: string;
    nonApplicableItems?: Array<{ productId: string; category?: string; reason: string }>;
    itemDiscounts?: Array<{ productId: string; discount: number; originalPrice: number }>;
  }> {
    const coupon = await this.findByCode(code);
    if (!coupon) {
      return { valid: false, message: 'Coupon not found' };
    }

    const user = await this.userService.findOne(validateDto.userId);
    if (!user) {
      return { valid: false, message: 'User not found' };
    }

    // Check active status
    if (!coupon.isActive) {
      return { valid: false, message: 'Coupon is not active' };
    }

    // Check date validity
    const now = new Date();
    if (now < coupon.startDate || now > coupon.endDate) {
      return { valid: false, message: 'Coupon has expired or not yet active' };
    }

    // Check minimum order value
    if (validateDto.cartValue < Number(coupon.minOrderValue)) {
      return {
        valid: false,
        message: `Minimum order value of ₹${coupon.minOrderValue} required`,
      };
    }

    // Check if coupon is user-specific
    if (coupon.targetUserId && coupon.targetUserId !== validateDto.userId) {
      return { valid: false, message: 'This coupon is not available for your account' };
    }

    // Check user eligibility
    if (!this.isUserEligible(coupon, user)) {
      return { valid: false, message: 'You are not eligible for this coupon' };
    }

    // Check usage limits
    const usageCheck = await this.checkUsageLimits(coupon, user.id);
    if (!usageCheck.valid) {
      return { valid: false, message: usageCheck.message };
    }

    // Check payment method
    if (
      coupon.paymentMethods &&
      coupon.paymentMethods.length > 0 &&
      !coupon.paymentMethods.includes(validateDto.paymentMethod)
    ) {
      return {
        valid: false,
        message: 'Coupon not valid for selected payment method',
      };
    }

    // Check per-item eligibility
    const nonApplicableItems: Array<{ productId: string; category?: string; reason: string }> = [];
    const applicableItems: Array<{ productId: string; category?: string; quantity?: number; price?: number }> = [];

    if (validateDto.items && validateDto.items.length > 0) {
      validateDto.items.forEach((item) => {
        const isApplicable = this.isItemApplicable(coupon, item);
        if (!isApplicable.applicable) {
          nonApplicableItems.push({
            productId: item.productId,
            category: item.category,
            reason: isApplicable.reason,
          });
        } else {
          applicableItems.push(item);
        }
      });

      // If no items are applicable, return invalid
      if (applicableItems.length === 0) {
        return {
          valid: false,
          message: 'Coupon not applicable to any items in cart',
          nonApplicableItems,
        };
      }
    }

    // Calculate applicable cart value (only applicable items)
    const applicableCartValue = applicableItems.reduce((sum: number, item: any) => {
      return sum + (item.price && item.quantity ? item.price * item.quantity : 0);
    }, 0) || validateDto.cartValue;

    // Calculate total discount (on applicable items only)
    const discount = this.calculateDiscount(
      coupon,
      applicableCartValue,
      undefined,
    );

    // Calculate per-item discounts (only for applicable items with price/quantity)
    const itemDiscounts: Array<{ productId: string; discount: number; originalPrice: number }> = [];
    if (applicableItems.length > 0) {
      // For percentage discounts, calculate per item
      if (coupon.discountType === DiscountType.PERCENTAGE) {
        applicableItems.forEach((item: any) => {
          if (item.price && item.quantity) {
            const itemValue = item.price * item.quantity;
            const itemDiscount = (itemValue * Number(coupon.discountValue)) / 100;
            const cappedDiscount = coupon.maxDiscountCap
              ? Math.min(itemDiscount, (itemValue / applicableCartValue) * Number(coupon.maxDiscountCap))
              : itemDiscount;
            itemDiscounts.push({
              productId: item.productId,
              discount: Math.round(cappedDiscount * 100) / 100,
              originalPrice: itemValue,
            });
          }
        });
      } else if (coupon.discountType === DiscountType.FIXED_AMOUNT) {
        // For fixed amount, distribute proportionally based on applicable item value
        const totalApplicableValue = applicableItems.reduce((sum: number, item: any) => {
          return sum + (item.price && item.quantity ? item.price * item.quantity : 0);
        }, 0);
        if (totalApplicableValue > 0) {
          applicableItems.forEach((item: any) => {
            if (item.price && item.quantity) {
              const itemValue = item.price * item.quantity;
              const itemDiscount = (itemValue / totalApplicableValue) * discount;
              itemDiscounts.push({
                productId: item.productId,
                discount: Math.round(itemDiscount * 100) / 100,
                originalPrice: itemValue,
              });
            }
          });
        }
      }
    }

    return {
      valid: true,
      discount,
      nonApplicableItems: nonApplicableItems.length > 0 ? nonApplicableItems : undefined,
      itemDiscounts: itemDiscounts.length > 0 ? itemDiscounts : undefined,
    };
  }

  private isItemApplicable(
    coupon: Coupon,
    item: { productId: string; category?: string },
  ): { applicable: boolean; reason: string } {
    // Check excluded products
    if (coupon.excludedProducts && coupon.excludedProducts.includes(item.productId)) {
      return { applicable: false, reason: 'Product is excluded from this coupon' };
    }

    // Check excluded categories
    if (item.category && coupon.excludedCategories && coupon.excludedCategories.includes(item.category)) {
      return { applicable: false, reason: 'Category is excluded from this coupon' };
    }

    // Check applicable products
    if (coupon.applicableProducts && coupon.applicableProducts.length > 0) {
      if (!coupon.applicableProducts.includes(item.productId)) {
        return { applicable: false, reason: 'Product not in applicable list' };
      }
    }

    // Check applicable categories
    if (coupon.applicableCategories && coupon.applicableCategories.length > 0) {
      if (!item.category || !coupon.applicableCategories.includes(item.category)) {
        return { applicable: false, reason: 'Category not in applicable list' };
      }
    }

    return { applicable: true, reason: '' };
  }

  async applyCoupon(
    code: string,
    userId: string,
    applyDto: ApplyCouponDto,
  ): Promise<{ discount: number; finalAmount: number; couponId: string }> {
    // Use transaction with pessimistic locking to prevent race conditions
    return await this.dataSource.transaction(async (manager) => {
      // Step 1: Lock and fetch coupon with pessimistic write lock (SELECT FOR UPDATE)
      const coupon = await manager.findOne(Coupon, {
        where: { code: code.toUpperCase() },
        lock: { mode: 'pessimistic_write' },
      });

      if (!coupon) {
        throw new NotFoundException('Coupon not found');
      }

      // Step 2: Validate coupon status and dates (with locked data)
      const now = new Date();
      if (!coupon.isActive) {
        throw new BadRequestException('Coupon is not active');
      }

      if (now < coupon.startDate || now > coupon.endDate) {
        throw new BadRequestException('Coupon has expired or not yet active');
      }

      // Step 3: Check minimum order value
      if (applyDto.cartValue < Number(coupon.minOrderValue)) {
        throw new BadRequestException(
          `Minimum order value of ₹${coupon.minOrderValue} required`,
        );
      }

      // Step 4: Check if coupon is user-specific
      if (coupon.targetUserId && coupon.targetUserId !== userId) {
        throw new BadRequestException('This coupon is not available for your account');
      }

      // Step 5: Get user (with lock to ensure consistency)
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_read' },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Step 6: Check user eligibility
      if (!this.isUserEligible(coupon, user)) {
        throw new BadRequestException('You are not eligible for this coupon');
      }

      // Step 7: Check total usage limit (with locked data - CRITICAL for race condition prevention)
      if (coupon.totalUsageLimit && coupon.currentUsageCount >= coupon.totalUsageLimit) {
        throw new BadRequestException('Coupon usage limit reached');
      }

      // Step 8: Check per-user limit (with locked data)
      if (coupon.perUserLimit) {
        const userUsageCount = await manager.count(CouponUsage, {
          where: {
            couponId: coupon.id,
            userId,
            status: CouponUsageStatus.APPLIED,
          },
        });
        if (userUsageCount >= coupon.perUserLimit) {
          throw new BadRequestException('You have reached the usage limit for this coupon');
        }
      }

      // Step 9: Check payment method
      if (
        coupon.paymentMethods &&
        coupon.paymentMethods.length > 0 &&
        !coupon.paymentMethods.includes(applyDto.paymentMethod)
      ) {
        throw new BadRequestException('Coupon not valid for selected payment method');
      }

      // Step 10: Calculate discount
      const discount = this.calculateDiscount(
        coupon,
        applyDto.cartValue,
        applyDto.items,
        applyDto.deliveryCharge || 0,
      );
      const finalAmount = applyDto.cartValue - discount;

      // Step 11: Atomically increment usage count (within transaction)
      coupon.currentUsageCount += 1;
      await manager.save(coupon);

      // Step 12: Clear cache (outside transaction to avoid transaction overhead)
      // Note: Cache invalidation happens after transaction commits
      setImmediate(async () => {
        await this.cacheManager.del(`available_coupons_${userId}`);
        await this.cacheManager.del(`coupon_${code.toUpperCase()}`);
      });

      return { discount, finalAmount, couponId: coupon.id };
    });
  }

  async getMyUsage(userId: string): Promise<CouponUsage[]> {
    return this.couponUsageRepository.find({
      where: { userId },
      relations: ['coupon'],
      order: { usedAt: 'DESC' },
    });
  }

  async recommendCoupons(
    userId: string,
    cartValue: number,
    items: Array<{ productId: string; category?: string; quantity?: number; price?: number }> = [],
    paymentMethod: string = 'card',
  ): Promise<{
    bestCoupon: { code: string; potentialSavings: number; coupon: Coupon } | null;
    alternativeCoupons: Array<{ code: string; potentialSavings: number; coupon: Coupon }>;
  }> {
    // Get all available coupons for the user
    const availableCoupons = await this.findAllAvailable(userId);

    if (availableCoupons.length === 0) {
      return {
        bestCoupon: null,
        alternativeCoupons: [],
      };
    }

    // Validate and calculate potential savings for each coupon
    const couponSavings: Array<{
      code: string;
      potentialSavings: number;
      coupon: Coupon;
      valid: boolean;
    }> = [];

    for (const coupon of availableCoupons) {
      try {
        const validateDto: ValidateCouponDto = {
          cartValue,
          items,
          paymentMethod,
          userId,
        };

        // Check basic eligibility first
        const user = await this.userService.findOne(userId);
        if (!user || !this.isUserEligible(coupon, user)) {
          continue;
        }

        // Check usage limits
        const usageCheck = await this.checkUsageLimits(coupon, userId);
        if (!usageCheck.valid) {
          continue;
        }

        // Check minimum order value
        if (cartValue < Number(coupon.minOrderValue)) {
          continue;
        }

        // Check payment method
        if (
          coupon.paymentMethods &&
          coupon.paymentMethods.length > 0 &&
          !coupon.paymentMethods.includes(paymentMethod)
        ) {
          continue;
        }

        // Check category/product applicability
        if (items.length > 0) {
          const hasApplicableItem = items.some((item) => {
            const isApplicable = this.isItemApplicable(coupon, item);
            return isApplicable.applicable;
          });

          if (!hasApplicableItem) {
            continue;
          }
        }

        // Calculate potential savings
        const applicableCartValue = items
          .filter((item) => {
            const isApplicable = this.isItemApplicable(coupon, item);
            return isApplicable.applicable;
          })
          .reduce((sum, item) => {
            return sum + (item.price && item.quantity ? item.price * item.quantity : 0);
          }, 0) || cartValue;

        const discount = this.calculateDiscount(coupon, applicableCartValue, undefined);

        couponSavings.push({
          code: coupon.code,
          potentialSavings: discount,
          coupon,
          valid: true,
        });
      } catch (error) {
        // Skip invalid coupons
        continue;
      }
    }

    // Sort by potential savings (descending)
    couponSavings.sort((a, b) => b.potentialSavings - a.potentialSavings);

    // Return best coupon and alternatives
    const bestCoupon = couponSavings.length > 0
      ? {
          code: couponSavings[0].code,
          potentialSavings: couponSavings[0].potentialSavings,
          coupon: couponSavings[0].coupon,
        }
      : null;

    const alternativeCoupons = couponSavings
      .slice(1, 6) // Top 5 alternatives (excluding best)
      .map((item) => ({
        code: item.code,
        potentialSavings: item.potentialSavings,
        coupon: item.coupon,
      }));

    return {
      bestCoupon,
      alternativeCoupons,
    };
  }

  isUserEligible(coupon: Coupon, user: User): boolean {
    if (coupon.userSegment === UserSegment.NEW_USERS && !user.isNewUser) {
      return false;
    }
    if (coupon.userSegment === UserSegment.PREMIUM_USERS && !user.isPremiumUser) {
      return false;
    }
    if (coupon.minPurchaseCount && user.totalOrders < coupon.minPurchaseCount) {
      return false;
    }
    return true;
  }

  private async checkUsageLimits(
    coupon: Coupon,
    userId: string,
  ): Promise<{ valid: boolean; message?: string }> {
    // Check total usage limit
    if (coupon.totalUsageLimit && coupon.currentUsageCount >= coupon.totalUsageLimit) {
      return { valid: false, message: 'Coupon usage limit reached' };
    }

    // Check per-user limit
    if (coupon.perUserLimit) {
      const userUsageCount = await this.couponUsageRepository.count({
        where: {
          couponId: coupon.id,
          userId,
          status: CouponUsageStatus.APPLIED,
        },
      });
      if (userUsageCount >= coupon.perUserLimit) {
        return { valid: false, message: 'You have reached the usage limit for this coupon' };
      }
    }

    return { valid: true };
  }

  private checkCategoryProductApplicability(
    coupon: Coupon,
    items: Array<{ productId: string; category?: string }>,
  ): boolean {
    // If no restrictions, applicable to all
    if (
      (!coupon.applicableCategories || coupon.applicableCategories.length === 0) &&
      (!coupon.applicableProducts || coupon.applicableProducts.length === 0)
    ) {
      // Check exclusions
      if (coupon.excludedCategories && coupon.excludedCategories.length > 0) {
        const hasExcludedCategory = items.some(
          (item) => item.category && coupon.excludedCategories?.includes(item.category),
        );
        if (hasExcludedCategory) return false;
      }
      if (coupon.excludedProducts && coupon.excludedProducts.length > 0) {
        const hasExcludedProduct = items.some((item) =>
          coupon.excludedProducts?.includes(item.productId),
        );
        if (hasExcludedProduct) return false;
      }
      return true;
    }

    // Check applicable categories
    if (coupon.applicableCategories && coupon.applicableCategories.length > 0) {
      const hasApplicableCategory = items.some(
        (item) => item.category && coupon.applicableCategories?.includes(item.category),
      );
      if (hasApplicableCategory) return true;
    }

    // Check applicable products
    if (coupon.applicableProducts && coupon.applicableProducts.length > 0) {
      const hasApplicableProduct = items.some((item) =>
        coupon.applicableProducts?.includes(item.productId),
      );
      if (hasApplicableProduct) return true;
    }

    return false;
  }

  calculateDiscount(
    coupon: Coupon,
    orderValue: number,
    items?: Array<{ productId: string; category?: string; quantity: number; price: number }>,
    deliveryCharge: number = 0,
  ): number {
    let discount = 0;

    switch (coupon.discountType) {
      case DiscountType.PERCENTAGE:
        discount = (orderValue * Number(coupon.discountValue)) / 100;
        if (coupon.maxDiscountCap) {
          discount = Math.min(discount, Number(coupon.maxDiscountCap));
        }
        break;

      case DiscountType.FIXED_AMOUNT:
        discount = Math.min(Number(coupon.discountValue), orderValue);
        break;

      case DiscountType.FREE_DELIVERY:
        discount = deliveryCharge;
        break;
    }

    return Math.round(discount * 100) / 100; // Round to 2 decimal places
  }

  async findByCode(code: string): Promise<Coupon | null> {
    const cacheKey = `coupon_${code.toUpperCase()}`;
    const cached = await this.cacheManager.get<Coupon>(cacheKey);
    if (cached) {
      return cached;
    }

    const coupon = await this.couponRepository.findOne({
      where: { code: code.toUpperCase() },
    });

    if (coupon) {
      await this.cacheManager.set(cacheKey, coupon, 600); // 10 minutes cache
    }

    return coupon;
  }

  async createReferralRewardCoupon(params: {
    userId: string;
    rewardAmount: number;
    couponType: 'referrer' | 'referee';
    endDate: Date;
  }): Promise<Coupon> {
    const { userId, rewardAmount, couponType, endDate } = params;
    const now = new Date();

    // Generate unique coupon code
    const codePrefix = couponType === 'referrer' ? 'REFERRER' : 'REFEREE';
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    let code = `${codePrefix}-${randomPart}`;
    
    // Ensure code is unique
    let existing = await this.couponRepository.findOne({ where: { code } });
    let attempts = 0;
    while (existing && attempts < 10) {
      const newRandomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
      code = `${codePrefix}-${newRandomPart}`;
      existing = await this.couponRepository.findOne({ where: { code } });
      attempts++;
    }

    // Get user to set as creator
    const user = await this.userService.findOne(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const coupon = this.couponRepository.create({
      code,
      title: couponType === 'referrer' 
        ? 'Referral Reward - Thank you for referring!' 
        : 'Welcome Reward - Thanks for joining!',
      description: couponType === 'referrer'
        ? `You earned ₹${rewardAmount} for referring a friend!`
        : `Welcome bonus of ₹${rewardAmount} for signing up with a referral code!`,
      discountType: DiscountType.FIXED_AMOUNT,
      discountValue: rewardAmount,
      minOrderValue: ReferralConfig.MIN_ORDER_VALUE,
      startDate: now,
      endDate,
      isActive: true,
      perUserLimit: 1, // One-time use only
      targetUserId: userId, // User-specific
      userSegment: UserSegment.ALL,
      createdBy: userId,
    });

    const savedCoupon = await this.couponRepository.save(coupon);
    
    // Clear cache for this user
    await this.cacheManager.del(`available_coupons_${userId}`);
    
    return savedCoupon;
  }
}

