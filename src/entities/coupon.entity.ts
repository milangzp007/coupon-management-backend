import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum DiscountType {
  PERCENTAGE = 'percentage',
  FIXED_AMOUNT = 'fixed_amount',
  FREE_DELIVERY = 'free_delivery',
}

export enum UserSegment {
  ALL = 'all',
  NEW_USERS = 'new_users',
  PREMIUM_USERS = 'premium_users',
}

@Entity('coupons')
export class Coupon {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({
    type: 'enum',
    enum: DiscountType,
  })
  discountType: DiscountType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  discountValue: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  minOrderValue: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  maxDiscountCap?: number;

  @Column()
  startDate: Date;

  @Column()
  endDate: Date;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  totalUsageLimit?: number;

  @Column({ nullable: true })
  perUserLimit?: number;

  @Column({ default: 0 })
  currentUsageCount: number;

  @Column('simple-array', { nullable: true })
  applicableCategories?: string[];

  @Column('simple-array', { nullable: true })
  applicableProducts?: string[];

  @Column({
    type: 'enum',
    enum: UserSegment,
    default: UserSegment.ALL,
  })
  userSegment: UserSegment;

  @Column({ nullable: true })
  minPurchaseCount?: number;

  @Column('simple-array', { nullable: true })
  excludedCategories?: string[];

  @Column('simple-array', { nullable: true })
  excludedProducts?: string[];

  @Column('simple-array', { nullable: true })
  paymentMethods?: string[];

  @Column({ nullable: true })
  targetUserId?: string;

  @Column()
  createdBy: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'createdBy' })
  creator: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

