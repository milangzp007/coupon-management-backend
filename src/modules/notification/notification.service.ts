import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual, In, Between } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Coupon } from '../../entities/coupon.entity';
import { CouponUsage, CouponUsageStatus } from '../../entities/coupon-usage.entity';
import { User } from '../../entities/user.entity';
import { CouponService } from '../coupon/coupon.service';
import { NotificationConfig } from '../../config/notification.config';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Coupon)
    private couponRepository: Repository<Coupon>,
    @InjectRepository(CouponUsage)
    private couponUsageRepository: Repository<CouponUsage>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private couponService: CouponService,
  ) {}

  /**
   * Cron job that runs daily at 9:00 AM
   * Finds coupons expiring in 3 days and notifies users who haven't used them
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async handleCouponExpiryNotifications() {
    this.logger.log('Starting coupon expiry notification job...');

    try {
      const now = new Date();
      const expiryDate = new Date(now);
      expiryDate.setDate(expiryDate.getDate() + NotificationConfig.EXPIRY_NOTIFICATION_DAYS);

      // Find coupons expiring in exactly N days (within the day range)
      const startOfDay = new Date(expiryDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(expiryDate);
      endOfDay.setHours(23, 59, 59, 999);

      const expiringCoupons = await this.couponRepository.find({
        where: {
          isActive: true,
          endDate: Between(startOfDay, endOfDay),
          startDate: LessThanOrEqual(now), // Only active coupons
        },
      });

      this.logger.log(
        `Found ${expiringCoupons.length} coupons expiring in ${NotificationConfig.EXPIRY_NOTIFICATION_DAYS} days`,
      );

      let totalNotificationsSent = 0;

      for (const coupon of expiringCoupons) {
        const usersToNotify = await this.findUsersToNotify(coupon);
        
        for (const user of usersToNotify) {
          await this.sendExpiryNotification(user, coupon);
          totalNotificationsSent++;
        }
      }

      this.logger.log(
        `Coupon expiry notification job completed. Sent ${totalNotificationsSent} notifications`,
      );
    } catch (error) {
      this.logger.error('Error in coupon expiry notification job:', error);
    }
  }

  /**
   * Find users who should be notified about an expiring coupon
   */
  private async findUsersToNotify(coupon: Coupon): Promise<User[]> {
    const usersToNotify: User[] = [];

    // If coupon is user-specific, only notify that specific user
    if (coupon.targetUserId) {
      const user = await this.userRepository.findOne({
        where: { id: coupon.targetUserId, isActive: true },
      });

      if (user) {
        // Check if user has already used this coupon
        const hasUsed = await this.hasUserUsedCoupon(user.id, coupon.id);
        if (!hasUsed) {
          usersToNotify.push(user);
        }
      }
    } else {
      // For global coupons, find all eligible users who haven't used it
      const allUsers = await this.userRepository.find({
        where: { isActive: true },
      });

      for (const user of allUsers) {
        // Check if user is eligible for this coupon
        const isEligible = this.couponService.isUserEligible(coupon, user);
        if (isEligible) {
          // Check if user has already used this coupon
          const hasUsed = await this.hasUserUsedCoupon(user.id, coupon.id);
          if (!hasUsed) {
            usersToNotify.push(user);
          }
        }
      }
    }

    return usersToNotify;
  }

  /**
   * Check if a user has already used a coupon
   */
  private async hasUserUsedCoupon(userId: string, couponId: string): Promise<boolean> {
    const usage = await this.couponUsageRepository.findOne({
      where: {
        userId,
        couponId,
        status: CouponUsageStatus.APPLIED,
      },
    });

    return !!usage;
  }

  /**
   * Send expiry notification to a user
   * 
   * IMPLEMENTATION GUIDE:
   * 
   * 1. Email Notifications:
   *    - Install: npm install @nestjs-modules/mailer nodemailer
   *    - Configure MailerModule in app.module.ts
   *    - Uncomment and implement sendEmailNotification method below
   * 
   * 2. Push Notifications:
   *    - For Firebase: npm install firebase-admin
   *    - For OneSignal: npm install node-onesignal
   *    - Uncomment and implement sendPushNotification method below
   * 
   * 3. In-App Notifications:
   *    - Create a Notification entity to store notifications
   *    - Create an endpoint to fetch user notifications
   *    - Display notifications in the frontend
   */
  private async sendExpiryNotification(user: User, coupon: Coupon): Promise<void> {
    this.logger.log(
      `Sending expiry notification to user ${user.email} for coupon ${coupon.code}`,
    );

    const notificationData = {
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      couponCode: coupon.code,
      couponTitle: coupon.title,
      expiryDate: coupon.endDate,
      discountValue: coupon.discountValue,
      discountType: coupon.discountType,
      daysUntilExpiry: NotificationConfig.EXPIRY_NOTIFICATION_DAYS,
    };

    this.logger.debug('Notification data:', JSON.stringify(notificationData, null, 2));

    // Send email notification if enabled
    if (NotificationConfig.EMAIL_ENABLED) {
      await this.sendEmailNotification(user.email, {
        subject: `${NotificationConfig.EMAIL_SUBJECT} - ${coupon.code}`,
        template: 'coupon-expiry',
        data: notificationData,
      });
    }

    // Send push notification if enabled
    if (NotificationConfig.PUSH_NOTIFICATION_ENABLED) {
      await this.sendPushNotification(user.id, {
        title: 'Coupon Expiring Soon!',
        body: `Your coupon ${coupon.code} expires in ${NotificationConfig.EXPIRY_NOTIFICATION_DAYS} days. Use it now!`,
        data: notificationData,
      });
    }

    // TODO: Store in-app notification in database
    // await this.storeInAppNotification(user.id, {
    //   type: 'coupon_expiry',
    //   title: `Coupon ${coupon.code} expires soon!`,
    //   message: `Your coupon expires in ${NotificationConfig.EXPIRY_NOTIFICATION_DAYS} days.`,
    //   data: notificationData,
    // });
  }

  /**
   * Send email notification
   * TODO: Implement with your email service (SendGrid, Mailgun, SMTP, etc.)
   */
  private async sendEmailNotification(
    email: string,
    options: { subject: string; template: string; data: any },
  ): Promise<void> {
    // Example implementation with @nestjs-modules/mailer:
    // await this.mailerService.sendMail({
    //   to: email,
    //   from: NotificationConfig.EMAIL_FROM,
    //   subject: options.subject,
    //   template: options.template,
    //   context: options.data,
    // });

    this.logger.log(`[EMAIL] Would send to ${email}: ${options.subject}`);
  }

  /**
   * Send push notification
   * TODO: Implement with your push notification service (FCM, OneSignal, etc.)
   */
  private async sendPushNotification(
    userId: string,
    options: { title: string; body: string; data: any },
  ): Promise<void> {
    // Example implementation with Firebase Cloud Messaging:
    // const message = {
    //   notification: {
    //     title: options.title,
    //     body: options.body,
    //   },
    //   data: options.data,
    //   token: userFcmToken, // Get from user's device tokens
    // };
    // await admin.messaging().send(message);

    // Example implementation with OneSignal:
    // await this.oneSignalClient.createNotification({
    //   headings: { en: options.title },
    //   contents: { en: options.body },
    //   include_external_user_ids: [userId],
    //   data: options.data,
    // });

    this.logger.log(`[PUSH] Would send to user ${userId}: ${options.title}`);
  }

  /**
   * Manual trigger for testing purposes
   * Can be called via API endpoint if needed
   */
  async triggerExpiryNotifications(): Promise<{ message: string; notificationsSent: number }> {
    this.logger.log('Manually triggering coupon expiry notifications...');
    await this.handleCouponExpiryNotifications();
    return {
      message: 'Expiry notifications triggered successfully',
      notificationsSent: 0, // This would be tracked in a real implementation
    };
  }
}

