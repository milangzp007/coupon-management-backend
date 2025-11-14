import {
  IsNumber,
  IsString,
  IsArray,
  IsOptional,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class OrderItemDto {
  @ApiProperty({ example: 'prod-123', description: 'Product ID' })
  @IsString()
  productId: string;

  @ApiProperty({ example: 2, description: 'Quantity of items', minimum: 1 })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: 500, description: 'Price per item', minimum: 0 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 'electronics', description: 'Product category' })
  @IsOptional()
  @IsString()
  category?: string;
}

export class CreateOrderDto {
  @ApiProperty({ example: 1000, description: 'Total order value before discount', minimum: 0 })
  @IsNumber()
  @Min(0)
  orderValue: number;

  @ApiProperty({ type: [OrderItemDto], description: 'Order items' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiProperty({ example: 'card', description: 'Payment method (card, upi, wallet)' })
  @IsString()
  paymentMethod: string;

  @ApiPropertyOptional({ example: 'FIRST50', description: 'Optional coupon code to apply' })
  @IsOptional()
  @IsString()
  couponCode?: string;

  @ApiPropertyOptional({ example: 50, description: 'Delivery charge', minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryCharge?: number;
}

