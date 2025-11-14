import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Order, OrderStatus } from '../../entities/order.entity';
import { CouponUsage, CouponUsageStatus } from '../../entities/coupon-usage.entity';
import { Coupon } from '../../entities/coupon.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { CouponService } from '../coupon/coupon.service';
import { UserService } from '../user/user.service';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(CouponUsage)
    private couponUsageRepository: Repository<CouponUsage>,
    @InjectRepository(Coupon)
    private couponRepository: Repository<Coupon>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private couponService: CouponService,
    private userService: UserService,
  ) {}

  async createOrder(userId: string, createOrderDto: CreateOrderDto) {
    let discountAmount = 0;
    let finalAmount = createOrderDto.orderValue;
    let couponUsage: CouponUsage | null = null;

    // Apply coupon if provided
    let couponId: string | undefined;
    if (createOrderDto.couponCode) {
      const applyResult = await this.couponService.applyCoupon(
        createOrderDto.couponCode,
        userId,
        {
          cartValue: createOrderDto.orderValue,
          items: createOrderDto.items,
          paymentMethod: createOrderDto.paymentMethod,
          deliveryCharge: createOrderDto.deliveryCharge || 0,
        },
      );

      discountAmount = applyResult.discount;
      finalAmount = applyResult.finalAmount;
      couponId = applyResult.couponId;
    }

    // Create order
    const order = this.orderRepository.create({
      userId,
      orderValue: createOrderDto.orderValue,
      discountAmount,
      finalAmount,
      appliedCouponCode: createOrderDto.couponCode,
      items: createOrderDto.items,
      paymentMethod: createOrderDto.paymentMethod,
      status: OrderStatus.PENDING,
    });

    const savedOrder = await this.orderRepository.save(order);

    // Create coupon usage record after order is saved (so we have orderId)
    if (createOrderDto.couponCode && couponId) {
      couponUsage = this.couponUsageRepository.create({
        couponId,
        userId,
        orderId: savedOrder.id,
        discountApplied: discountAmount,
        orderValue: createOrderDto.orderValue,
        finalOrderValue: finalAmount,
        status: CouponUsageStatus.APPLIED,
      });
      await this.couponUsageRepository.save(couponUsage);
    }

    // Update user stats
    await this.userService.updateUserStats(userId, finalAmount);

    // Invalidate revenue impact analytics cache when order is created
    // Note: We invalidate all date variations by pattern (or rely on TTL)
    // For simplicity, we'll let TTL handle it, but could add pattern invalidation here

    return savedOrder;
  }

  async cancelOrder(orderId: string, userId: string) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId, userId },
      relations: ['user'],
    });

    if (!order) {
      throw new BadRequestException('Order not found');
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Order already cancelled');
    }

    order.status = OrderStatus.CANCELLED;
    await this.orderRepository.save(order);

    // Revert coupon usage if exists
    if (order.appliedCouponCode) {
      const couponUsage = await this.couponUsageRepository.findOne({
        where: { orderId: order.id, status: CouponUsageStatus.APPLIED },
      });

      if (couponUsage) {
        couponUsage.status = CouponUsageStatus.REFUNDED;
        await this.couponUsageRepository.save(couponUsage);

        // Decrement coupon usage count
        const coupon = await this.couponRepository.findOne({
          where: { id: couponUsage.couponId },
        });
        if (coupon && coupon.currentUsageCount > 0) {
          coupon.currentUsageCount -= 1;
          await this.couponRepository.save(coupon);
          
          // Invalidate coupon cache
          await this.cacheManager.del(`coupon_${coupon.code}`);
        }
      }
    }

    // Invalidate revenue impact analytics cache when order is cancelled
    // Note: We rely on TTL for analytics cache expiration

    return order;
  }
}

