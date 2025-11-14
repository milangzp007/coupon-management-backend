import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { CouponService, ValidateCouponDto, ApplyCouponDto } from './coupon.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User, UserRole } from '../../entities/user.entity';
import { ValidateCouponDto as ValidateCouponDtoClass } from './dto/validate-coupon.dto';
import { RecommendCouponDto } from './dto/recommend-coupon.dto';

@ApiTags('coupons')
@ApiBearerAuth('JWT-auth')
@Controller('coupons')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CouponController {
  constructor(private readonly couponService: CouponService) {}

  @Get('available')
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Get all available coupons for current user' })
  @ApiResponse({ status: 200, description: 'List of available coupons' })
  async getAvailableCoupons(@CurrentUser() user: User) {
    return this.couponService.findAllAvailable(user.id);
  }

  @Post(':code/validate')
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Validate if coupon is valid for cart' })
  @ApiParam({ name: 'code', description: 'Coupon code', example: 'FIRST50' })
  @ApiResponse({ status: 200, description: 'Coupon validation result' })
  @ApiBody({ type: ValidateCouponDtoClass })
  async validateCoupon(
    @Param('code') code: string,
    @CurrentUser() user: User,
    @Body() body: ValidateCouponDtoClass,
  ) {
    const validateDto: ValidateCouponDto = {
      cartValue: body.cartValue || 0,
      items: body.items || [],
      paymentMethod: body.paymentMethod || 'card',
      userId: user.id,
    };
    return this.couponService.validateCoupon(code, validateDto);
  }

  @Post(':code/apply')
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Apply coupon to cart/order' })
  @ApiParam({ name: 'code', description: 'Coupon code', example: 'FIRST50' })
  @ApiResponse({ status: 200, description: 'Coupon applied successfully' })
  @ApiResponse({ status: 400, description: 'Invalid coupon or validation failed' })
  @ApiBody({ type: Object })
  async applyCoupon(
    @Param('code') code: string,
    @CurrentUser() user: User,
    @Body() applyDto: ApplyCouponDto,
  ) {
    return this.couponService.applyCoupon(code, user.id, applyDto);
  }

  @Get('my-usage')
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Get user coupon usage history' })
  @ApiResponse({ status: 200, description: 'List of coupon usage history' })
  async getMyUsage(@CurrentUser() user: User) {
    return this.couponService.getMyUsage(user.id);
  }

  @Post('recommend')
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Get recommended coupons based on cart' })
  @ApiResponse({
    status: 200,
    description: 'Recommended coupons with best coupon and alternatives',
    schema: {
      type: 'object',
      properties: {
        bestCoupon: {
          type: 'object',
          nullable: true,
          properties: {
            code: { type: 'string', example: 'SAVE200' },
            potentialSavings: { type: 'number', example: 200 },
            coupon: { type: 'object' },
          },
        },
        alternativeCoupons: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              potentialSavings: { type: 'number' },
              coupon: { type: 'object' },
            },
          },
        },
      },
    },
  })
  @ApiBody({ type: RecommendCouponDto })
  async recommendCoupons(
    @CurrentUser() user: User,
    @Body() body: RecommendCouponDto,
  ) {
    return this.couponService.recommendCoupons(
      body.userId || user.id,
      body.cartValue,
      body.items || [],
      'card', // Default payment method, can be made configurable
    );
  }
}

