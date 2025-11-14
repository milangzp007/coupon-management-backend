import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Repository } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { OrderService } from './order.service';
import { Order, OrderStatus } from '../../entities/order.entity';
import { CouponUsage, CouponUsageStatus } from '../../entities/coupon-usage.entity';
import { Coupon } from '../../entities/coupon.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { CouponService } from '../coupon/coupon.service';
import { UserService } from '../user/user.service';

describe('OrderService', () => {
  let service: OrderService;
  let orderRepository: Repository<Order>;
  let couponUsageRepository: Repository<CouponUsage>;
  let couponRepository: Repository<Coupon>;
  let couponService: CouponService;
  let userService: UserService;

  const mockOrderRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };

  const mockCouponUsageRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };

  const mockCouponRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockCacheManager = {
    del: jest.fn(),
  };

  const mockCouponService = {
    applyCoupon: jest.fn(),
    findByCode: jest.fn(),
  };

  const mockUserService = {
    updateUserStats: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        {
          provide: getRepositoryToken(Order),
          useValue: mockOrderRepository,
        },
        {
          provide: getRepositoryToken(CouponUsage),
          useValue: mockCouponUsageRepository,
        },
        {
          provide: getRepositoryToken(Coupon),
          useValue: mockCouponRepository,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
        {
          provide: CouponService,
          useValue: mockCouponService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
    orderRepository = module.get<Repository<Order>>(getRepositoryToken(Order));
    couponUsageRepository = module.get<Repository<CouponUsage>>(
      getRepositoryToken(CouponUsage),
    );
    couponRepository = module.get<Repository<Coupon>>(getRepositoryToken(Coupon));
    couponService = module.get<CouponService>(CouponService);
    userService = module.get<UserService>(UserService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createOrder', () => {
    it('should create order without coupon', async () => {
      const createOrderDto: CreateOrderDto = {
        orderValue: 1000,
        items: [{ productId: 'prod-1', quantity: 1, price: 1000 }],
        paymentMethod: 'card',
      };

      const order = {
        id: 'order-id',
        ...createOrderDto,
        userId: 'user-id',
        discountAmount: 0,
        finalAmount: 1000,
        status: OrderStatus.PENDING,
      };

      mockOrderRepository.create.mockReturnValue(order);
      mockOrderRepository.save.mockResolvedValue(order);

      const result = await service.createOrder('user-id', createOrderDto);

      expect(result).toEqual(order);
      expect(mockCouponService.applyCoupon).not.toHaveBeenCalled();
      expect(mockUserService.updateUserStats).toHaveBeenCalled();
    });

    it('should create order with coupon', async () => {
      const createOrderDto: CreateOrderDto = {
        orderValue: 1000,
        items: [{ productId: 'prod-1', quantity: 1, price: 1000 }],
        paymentMethod: 'card',
        couponCode: 'TEST50',
      };

      mockCouponService.applyCoupon.mockResolvedValue({
        discount: 100,
        finalAmount: 900,
        couponId: 'coupon-id',
      });

      const order = {
        id: 'order-id',
        ...createOrderDto,
        userId: 'user-id',
        discountAmount: 100,
        finalAmount: 900,
        status: OrderStatus.PENDING,
      };

      mockOrderRepository.create.mockReturnValue(order);
      mockOrderRepository.save.mockResolvedValue(order);
      mockCouponUsageRepository.create.mockReturnValue({
        id: 'usage-id',
        couponId: 'coupon-id',
        userId: 'user-id',
        orderId: 'order-id',
      });
      mockCouponUsageRepository.save.mockResolvedValue({});

      const result = await service.createOrder('user-id', createOrderDto);

      expect(result).toEqual(order);
      expect(mockCouponService.applyCoupon).toHaveBeenCalled();
      expect(mockCouponUsageRepository.save).toHaveBeenCalled();
    });
  });

  describe('cancelOrder', () => {
    it('should cancel order and revert coupon usage', async () => {
      const order: Partial<Order> = {
        id: 'order-id',
        userId: 'user-id',
        status: OrderStatus.PENDING,
        appliedCouponCode: 'TEST50',
      };

      const couponUsage: Partial<CouponUsage> = {
        id: 'usage-id',
        couponId: 'coupon-id',
        status: CouponUsageStatus.APPLIED,
      };

      const coupon: Partial<Coupon> = {
        id: 'coupon-id',
        code: 'TEST50',
        currentUsageCount: 5,
      };

      mockOrderRepository.findOne.mockResolvedValue(order);
      mockCouponUsageRepository.findOne.mockResolvedValue(couponUsage);
      mockCouponRepository.findOne.mockResolvedValue(coupon);
      mockOrderRepository.save.mockResolvedValue({ ...order, status: OrderStatus.CANCELLED });
      mockCouponUsageRepository.save.mockResolvedValue({
        ...couponUsage,
        status: CouponUsageStatus.REFUNDED,
      });
      mockCouponRepository.save.mockResolvedValue({ ...coupon, currentUsageCount: 4 });

      const result = await service.cancelOrder('order-id', 'user-id');

      expect(result.status).toBe(OrderStatus.CANCELLED);
      expect(mockCouponUsageRepository.save).toHaveBeenCalled();
      expect(mockCouponRepository.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException if order not found', async () => {
      mockOrderRepository.findOne.mockResolvedValue(null);

      await expect(service.cancelOrder('order-id', 'user-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if order already cancelled', async () => {
      const order: Partial<Order> = {
        id: 'order-id',
        userId: 'user-id',
        status: OrderStatus.CANCELLED,
      };

      mockOrderRepository.findOne.mockResolvedValue(order);

      await expect(service.cancelOrder('order-id', 'user-id')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});

