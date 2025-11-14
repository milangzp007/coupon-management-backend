import { Injectable, UnauthorizedException, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../../entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { CouponService } from '../coupon/coupon.service';
import { ReferralConfig } from '../../config/referral.config';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private couponService: CouponService,
  ) {}

  async register(registerDto: RegisterDto) {
    const existingUser = await this.userRepository.findOne({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Handle referral code if provided
    let referrer: User | null = null;
    if (registerDto.referralCode) {
      referrer = await this.userRepository.findOne({
        where: { referralCode: registerDto.referralCode.toUpperCase() },
      });

      if (!referrer) {
        throw new BadRequestException('Invalid referral code');
      }

      if (!referrer.isActive) {
        throw new BadRequestException('Referral code belongs to an inactive user');
      }

      // Check if referrer has reached max referrals
      if (referrer.referralCount >= ReferralConfig.MAX_REFERRALS_PER_USER) {
        throw new BadRequestException('Referrer has reached maximum referral limit');
      }
    }

    // Generate unique referral code for new user
    const referralCode = await this.generateUniqueReferralCode();

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);
    const user = this.userRepository.create({
      ...registerDto,
      password: hashedPassword,
      role: registerDto.role || UserRole.CUSTOMER,
      isNewUser: true,
      referralCode,
      referredBy: referrer?.id || null,
    });

    const savedUser = await this.userRepository.save(user);

    // Create referral reward coupons if referral code was used
    if (referrer) {
      await this.createReferralRewards(referrer, savedUser);
      
      // Increment referrer's referral count
      referrer.referralCount += 1;
      await this.userRepository.save(referrer);
    }

    const { password, ...result } = savedUser;
    return result;
  }

  private async generateUniqueReferralCode(): Promise<string> {
    let code: string;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (!isUnique && attempts < maxAttempts) {
      // Generate code: REF-{random 6 alphanumeric characters}
      const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
      code = `${ReferralConfig.REFERRAL_CODE_PREFIX}-${randomPart}`;

      const existing = await this.userRepository.findOne({
        where: { referralCode: code },
      });

      if (!existing) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      // Fallback: use timestamp-based code
      const timestamp = Date.now().toString(36).toUpperCase();
      code = `${ReferralConfig.REFERRAL_CODE_PREFIX}-${timestamp}`;
    }

    return code;
  }

  private async createReferralRewards(referrer: User, referee: User): Promise<void> {
    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + ReferralConfig.VALIDITY_DAYS);

    // Create reward coupon for referrer
    await this.couponService.createReferralRewardCoupon({
      userId: referrer.id,
      rewardAmount: ReferralConfig.REFERRER_REWARD,
      couponType: 'referrer',
      endDate,
    });

    // Create reward coupon for referee
    await this.couponService.createReferralRewardCoupon({
      userId: referee.id,
      rewardAmount: ReferralConfig.REFEREE_REWARD,
      couponType: 'referee',
      endDate,
    });
  }

  async login(loginDto: LoginDto) {
    const user = await this.userRepository.findOne({
      where: { email: loginDto.email },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { email: user.email, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }
}

