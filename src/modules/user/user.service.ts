import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { User } from '../../entities/user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async findOne(id: string): Promise<User | null> {
    const cacheKey = `user_${id}`;
    const cached = await this.cacheManager.get<User>(cacheKey);
    if (cached) {
      return cached;
    }

    const user = await this.userRepository.findOne({ where: { id } });
    if (user) {
      await this.cacheManager.set(cacheKey, user, 900); // 15 minutes TTL
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    const cacheKey = `user_email_${email.toLowerCase()}`;
    const cached = await this.cacheManager.get<User>(cacheKey);
    if (cached) {
      return cached;
    }

    const user = await this.userRepository.findOne({ where: { email } });
    if (user) {
      // Cache by both email and ID
      await this.cacheManager.set(cacheKey, user, 900); // 15 minutes TTL
      await this.cacheManager.set(`user_${user.id}`, user, 900);
    }
    return user;
  }

  async updateUserStats(userId: string, orderValue: number) {
    const user = await this.findOne(userId);
    if (user) {
      user.totalOrders += 1;
      user.totalSpent += orderValue;
      user.isNewUser = false;
      const updatedUser = await this.userRepository.save(user);
      
      // Invalidate user cache when stats change
      await this.cacheManager.del(`user_${userId}`);
      await this.cacheManager.del(`user_email_${user.email.toLowerCase()}`);
      // Also invalidate available coupons as user eligibility might change
      await this.cacheManager.del(`available_coupons_${userId}`);
      
      return updatedUser;
    }
  }

  /**
   * Invalidate user cache (call this when user data changes)
   */
  async invalidateUserCache(userId: string, email?: string): Promise<void> {
    await this.cacheManager.del(`user_${userId}`);
    if (email) {
      await this.cacheManager.del(`user_email_${email.toLowerCase()}`);
    }
  }
}

