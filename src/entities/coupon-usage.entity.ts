import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Coupon } from './coupon.entity';
import { User } from './user.entity';
import { Order } from './order.entity';

export enum CouponUsageStatus {
  APPLIED = 'applied',
  REFUNDED = 'refunded',
  EXPIRED = 'expired',
}

@Entity('coupon_usages')
export class CouponUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  couponId: string;

  @ManyToOne(() => Coupon)
  @JoinColumn({ name: 'couponId' })
  coupon: Coupon;

  @Column()
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  orderId: string;

  @ManyToOne(() => Order)
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  discountApplied: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  orderValue: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  finalOrderValue: number;

  @CreateDateColumn()
  usedAt: Date;

  @Column({
    type: 'enum',
    enum: CouponUsageStatus,
    default: CouponUsageStatus.APPLIED,
  })
  status: CouponUsageStatus;
}

