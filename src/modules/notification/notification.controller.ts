import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';

@ApiTags('notifications')
@ApiBearerAuth('JWT-auth')
@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post('trigger-expiry')
  @ApiOperation({ summary: 'Manually trigger coupon expiry notifications (Admin only)' })
  @ApiResponse({ status: 200, description: 'Notifications triggered successfully' })
  async triggerExpiryNotifications() {
    return this.notificationService.triggerExpiryNotifications();
  }
}

