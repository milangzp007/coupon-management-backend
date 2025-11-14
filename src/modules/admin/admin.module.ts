import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { Coupon } from '../../entities/coupon.entity';
import { CouponUsage } from '../../entities/coupon-usage.entity';
import { Order } from '../../entities/order.entity';
import { CouponModule } from '../coupon/coupon.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Coupon, CouponUsage, Order]),
    CouponModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}

