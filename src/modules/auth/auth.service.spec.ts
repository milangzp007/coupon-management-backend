import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User, UserRole } from '../../entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { CouponService } from '../coupon/coupon.service';

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: Repository<User>;
  let jwtService: JwtService;
  let couponService: CouponService;

  const mockUserRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  const mockCouponService = {
    createReferralRewardCoupon: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: CouponService,
          useValue: mockCouponService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    jwtService = module.get<JwtService>(JwtService);
    couponService = module.get<CouponService>(CouponService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const registerDto: RegisterDto = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        phone: '+1234567890',
      };

      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue({
        ...registerDto,
        id: 'user-id',
        password: 'hashed-password',
      });
      mockUserRepository.save.mockResolvedValue({
        id: 'user-id',
        email: registerDto.email,
        name: registerDto.name,
        role: UserRole.CUSTOMER,
      });

      const result = await service.register(registerDto);

      expect(result).toBeDefined();
      expect(result.email).toBe(registerDto.email);
      expect(mockUserRepository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException if email already exists', async () => {
      const registerDto: RegisterDto = {
        email: 'existing@example.com',
        password: 'password123',
        name: 'Test User',
        phone: '+1234567890',
      };

      mockUserRepository.findOne.mockResolvedValue({ id: 'existing-id' });

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
    });

    it('should handle referral code registration', async () => {
      const registerDto: RegisterDto = {
        email: 'new@example.com',
        password: 'password123',
        name: 'Test User',
        phone: '+1234567890',
        referralCode: 'REF123',
      };

      const referrer: Partial<User> = {
        id: 'referrer-id',
        referralCode: 'REF123',
        referralCount: 5,
        isActive: true,
      };

      mockUserRepository.findOne
        .mockResolvedValueOnce(null) // No existing user
        .mockResolvedValueOnce(referrer); // Referrer found

      mockUserRepository.create.mockReturnValue({
        ...registerDto,
        id: 'user-id',
        referredBy: referrer.id,
      });
      mockUserRepository.save.mockResolvedValue({
        id: 'user-id',
        email: registerDto.email,
        referredBy: referrer.id,
      });
      mockCouponService.createReferralRewardCoupon.mockResolvedValue(undefined);

      await service.register(registerDto);

      expect(mockCouponService.createReferralRewardCoupon).toHaveBeenCalledTimes(2);
    });

    it('should throw BadRequestException for invalid referral code', async () => {
      const registerDto: RegisterDto = {
        email: 'new@example.com',
        password: 'password123',
        name: 'Test User',
        phone: '+1234567890',
        referralCode: 'INVALID',
      };

      mockUserRepository.findOne
        .mockResolvedValueOnce(null) // No existing user
        .mockResolvedValueOnce(null); // No referrer found

      await expect(service.register(registerDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('login', () => {
    it('should login user successfully', async () => {
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      const user: Partial<User> = {
        id: 'user-id',
        email: loginDto.email,
        name: 'Test User',
        role: UserRole.CUSTOMER,
        password: await bcrypt.hash(loginDto.password, 10),
        isActive: true,
      };

      mockUserRepository.findOne.mockResolvedValue(user);
      mockJwtService.sign.mockReturnValue('jwt-token');

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('access_token');
      expect(result.user.email).toBe(loginDto.email);
      expect(mockJwtService.sign).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'wrong-password',
      };

      const user: Partial<User> = {
        id: 'user-id',
        email: loginDto.email,
        password: await bcrypt.hash('correct-password', 10),
        isActive: true,
      };

      mockUserRepository.findOne.mockResolvedValue(user);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      const user: Partial<User> = {
        id: 'user-id',
        email: loginDto.email,
        password: await bcrypt.hash(loginDto.password, 10),
        isActive: false,
      };

      mockUserRepository.findOne.mockResolvedValue(user);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      const loginDto: LoginDto = {
        email: 'nonexistent@example.com',
        password: 'password123',
      };

      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });
  });
});

