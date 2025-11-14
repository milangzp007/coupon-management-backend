import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { UserService } from './user.service';
import { User } from '../../entities/user.entity';

describe('UserService', () => {
  let service: UserService;
  let userRepository: Repository<User>;

  const mockUserRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockCacheManager = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findOne', () => {
    it('should return cached user if available', async () => {
      const user = { id: 'user-id', email: 'test@example.com' } as User;

      mockCacheManager.get.mockResolvedValue(user);

      const result = await service.findOne('user-id');

      expect(result).toEqual(user);
      expect(mockUserRepository.findOne).not.toHaveBeenCalled();
    });

    it('should return user by id and cache it', async () => {
      const user = { id: 'user-id', email: 'test@example.com' } as User;

      mockCacheManager.get.mockResolvedValue(null);
      mockUserRepository.findOne.mockResolvedValue(user);

      const result = await service.findOne('user-id');

      expect(result).toEqual(user);
      expect(mockCacheManager.set).toHaveBeenCalled();
    });

    it('should return null if user not found', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockUserRepository.findOne.mockResolvedValue(null);

      const result = await service.findOne('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('should return cached user if available', async () => {
      const user = { id: 'user-id', email: 'test@example.com' } as User;

      mockCacheManager.get.mockResolvedValue(user);

      const result = await service.findByEmail('test@example.com');

      expect(result).toEqual(user);
      expect(mockUserRepository.findOne).not.toHaveBeenCalled();
    });

    it('should return user by email and cache it', async () => {
      const user = { id: 'user-id', email: 'test@example.com' } as User;

      mockCacheManager.get.mockResolvedValue(null);
      mockUserRepository.findOne.mockResolvedValue(user);

      const result = await service.findByEmail('test@example.com');

      expect(result).toEqual(user);
      expect(mockCacheManager.set).toHaveBeenCalledTimes(2); // Both email and id cache
    });
  });

  describe('updateUserStats', () => {
    it('should update user stats and invalidate cache', async () => {
      const user = {
        id: 'user-id',
        email: 'test@example.com',
        totalOrders: 5,
        totalSpent: 1000,
      } as User;

      mockCacheManager.get.mockResolvedValue(null);
      mockUserRepository.findOne.mockResolvedValue(user);
      mockUserRepository.save.mockResolvedValue({
        ...user,
        totalOrders: 6,
        totalSpent: 1500,
      });

      await service.updateUserStats('user-id', 500);

      expect(mockUserRepository.save).toHaveBeenCalled();
      expect(mockCacheManager.del).toHaveBeenCalledTimes(3); // user, email, available_coupons
    });
  });
});

