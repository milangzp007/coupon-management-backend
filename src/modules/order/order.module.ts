import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { Order } from '../../entities/order.entity';
import { CouponUsage } from '../../entities/coupon-usage.entity';
import { Coupon } from '../../entities/coupon.entity';
import { CouponModule } from '../coupon/coupon.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, CouponUsage, Coupon]),
    CouponModule,
    UserModule,
  ],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}

