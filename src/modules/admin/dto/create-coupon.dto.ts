import {
  IsString,
  IsEnum,
  IsNumber,
  IsDateString,
  IsBoolean,
  IsOptional,
  IsArray,
  Min,
  Max,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DiscountType, UserSegment } from '../../../entities/coupon.entity';

export class CreateCouponDto {
  @ApiProperty({ example: 'FIRST50', description: 'Unique coupon code' })
  @IsString()
  code: string;

  @ApiProperty({ example: '50% off on first order', description: 'Coupon title' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'Get 50% off on your first order', description: 'Coupon description' })
  @IsString()
  description: string;

  @ApiProperty({ enum: DiscountType, example: DiscountType.PERCENTAGE, description: 'Type of discount' })
  @IsEnum(DiscountType)
  discountType: DiscountType;

  @ApiProperty({ example: 50, description: 'Discount value (percentage or fixed amount)', minimum: 0 })
  @IsNumber()
  @Min(0)
  discountValue: number;

  @ApiProperty({ example: 500, description: 'Minimum order value required', minimum: 0 })
  @IsNumber()
  @Min(0)
  minOrderValue: number;

  @ApiPropertyOptional({ example: 200, description: 'Maximum discount cap (required for percentage)', minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @ValidateIf((o) => o.discountType === DiscountType.PERCENTAGE)
  maxDiscountCap?: number;

  @ApiProperty({ example: '2024-01-01T00:00:00Z', description: 'Coupon start date' })
  @IsDateString()
  startDate: Date;

  @ApiProperty({ example: '2024-12-31T23:59:59Z', description: 'Coupon end date' })
  @IsDateString()
  endDate: Date;

  @ApiPropertyOptional({ example: true, description: 'Whether coupon is active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 1000, description: 'Total usage limit for the coupon', minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  totalUsageLimit?: number;

  @ApiPropertyOptional({ example: 1, description: 'Usage limit per user', minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  perUserLimit?: number;

  @ApiPropertyOptional({ example: ['electronics', 'groceries'], description: 'Applicable product categories', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableCategories?: string[];

  @ApiPropertyOptional({ example: ['prod-123', 'prod-456'], description: 'Applicable product IDs', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableProducts?: string[];

  @ApiPropertyOptional({ enum: UserSegment, example: UserSegment.NEW_USERS, description: 'Target user segment', default: UserSegment.ALL })
  @IsOptional()
  @IsEnum(UserSegment)
  userSegment?: UserSegment;

  @ApiPropertyOptional({ example: 3, description: 'Minimum purchase count required', minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minPurchaseCount?: number;

  @ApiPropertyOptional({ example: ['clothing'], description: 'Excluded product categories', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludedCategories?: string[];

  @ApiPropertyOptional({ example: ['prod-789'], description: 'Excluded product IDs', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludedProducts?: string[];

  @ApiPropertyOptional({ example: ['card', 'upi'], description: 'Allowed payment methods', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  paymentMethods?: string[];
}

