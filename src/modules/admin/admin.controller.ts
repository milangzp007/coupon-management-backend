import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../entities/user.entity';
import { User } from '../../entities/user.entity';

@ApiTags('admin')
@ApiBearerAuth('JWT-auth')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('coupons')
  @ApiOperation({ summary: 'Create a new coupon' })
  @ApiResponse({ status: 201, description: 'Coupon created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid coupon data' })
  @ApiResponse({ status: 409, description: 'Coupon code already exists' })
  @ApiBody({ type: CreateCouponDto })
  async createCoupon(
    @Body() createCouponDto: CreateCouponDto,
    @CurrentUser() user: User,
  ) {
    return this.adminService.createCoupon(createCouponDto, user.id);
  }

  @Get('coupons')
  @ApiOperation({ summary: 'Get all coupons with optional filters' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'discountType', required: false })
  @ApiQuery({ name: 'userSegment', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiResponse({ status: 200, description: 'List of coupons' })
  async getAllCoupons(
    @Query('isActive') isActive?: string,
    @Query('discountType') discountType?: string,
    @Query('userSegment') userSegment?: string,
    @Query('search') search?: string,
  ) {
    const filters: any = {};
    if (isActive !== undefined) filters.isActive = isActive === 'true';
    if (discountType) filters.discountType = discountType;
    if (userSegment) filters.userSegment = userSegment;
    if (search) filters.search = search;

    return this.adminService.findAll(filters);
  }

  @Get('coupons/:id')
  @ApiOperation({ summary: 'Get coupon by ID' })
  @ApiParam({ name: 'id', description: 'Coupon ID' })
  @ApiResponse({ status: 200, description: 'Coupon details' })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  async getCoupon(@Param('id') id: string) {
    return this.adminService.findOne(id);
  }

  @Put('coupons/:id')
  @ApiOperation({ summary: 'Update coupon details' })
  @ApiParam({ name: 'id', description: 'Coupon ID' })
  @ApiResponse({ status: 200, description: 'Coupon updated successfully' })
  @ApiBody({ type: UpdateCouponDto })
  async updateCoupon(@Param('id') id: string, @Body() updateCouponDto: UpdateCouponDto) {
    return this.adminService.updateCoupon(id, updateCouponDto);
  }

  @Patch('coupons/:id/toggle-status')
  @ApiOperation({ summary: 'Toggle coupon active status' })
  @ApiParam({ name: 'id', description: 'Coupon ID' })
  @ApiResponse({ status: 200, description: 'Coupon status toggled' })
  async toggleCouponStatus(@Param('id') id: string) {
    return this.adminService.toggleStatus(id);
  }

  @Delete('coupons/:id')
  @ApiOperation({ summary: 'Delete coupon (soft delete)' })
  @ApiParam({ name: 'id', description: 'Coupon ID' })
  @ApiResponse({ status: 200, description: 'Coupon deleted successfully' })
  async deleteCoupon(@Param('id') id: string) {
    await this.adminService.deleteCoupon(id);
    return { message: 'Coupon deleted successfully' };
  }

  @Get('coupons/:id/analytics')
  @ApiOperation({ summary: 'Get coupon performance analytics' })
  @ApiParam({ name: 'id', description: 'Coupon ID' })
  @ApiResponse({ status: 200, description: 'Coupon analytics data' })
  async getCouponAnalytics(@Param('id') id: string) {
    return this.adminService.getCouponAnalytics(id);
  }

  @Get('reports/coupon-usage')
  @ApiOperation({ summary: 'Get coupon usage report with date filters' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'couponId', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Coupon usage report' })
  async getCouponUsageReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('couponId') couponId?: string,
  ) {
    const filters: any = {};
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);
    if (couponId) filters.couponId = couponId;

    return this.adminService.getCouponUsageReport(filters);
  }

  @Get('reports/top-coupons')
  @ApiOperation({ summary: 'Get top used coupons' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of top coupons to return', example: 10 })
  @ApiResponse({ status: 200, description: 'Top coupons list' })
  async getTopCoupons(@Query('limit') limit?: string) {
    return this.adminService.getTopCoupons(limit ? parseInt(limit) : 10);
  }

  @Get('reports/revenue-impact')
  @ApiOperation({ summary: 'Get revenue impact report' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Revenue impact data' })
  async getRevenueImpact(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const filters: any = {};
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);

    return this.adminService.getRevenueImpact(filters);
  }
}

