import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { Coupon } from '../../entities/coupon.entity';
import { CouponUsage } from '../../entities/coupon-usage.entity';
import { User } from '../../entities/user.entity';
import { CouponModule } from '../coupon/coupon.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Coupon, CouponUsage, User]),
    CouponModule,
  ],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}

