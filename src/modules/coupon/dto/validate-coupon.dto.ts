import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsString, IsArray, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class CartItemDto {
  @ApiProperty({ example: 'prod-123', description: 'Product ID' })
  @IsString()
  productId: string;

  @ApiPropertyOptional({ example: 'electronics', description: 'Product category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 1, description: 'Product quantity' })
  @IsOptional()
  @IsNumber()
  quantity?: number;

  @ApiPropertyOptional({ example: 1000, description: 'Product price' })
  @IsOptional()
  @IsNumber()
  price?: number;
}

export class ValidateCouponDto {
  @ApiProperty({ example: 1000, description: 'Cart value in currency units' })
  @IsNumber()
  cartValue: number;

  @ApiPropertyOptional({ type: [CartItemDto], description: 'Cart items' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items?: CartItemDto[];

  @ApiPropertyOptional({ example: 'card', description: 'Payment method', default: 'card' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;
}

