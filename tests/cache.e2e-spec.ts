import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest'; 
import { AppModule } from '../src/app.module';
import { RedisService } from '../src/redis/redis.service';
import { PrismaService } from '../src/prisma/prisma.service';

type User = Awaited<ReturnType<PrismaService['user']['create']>>;
type Role = Awaited<ReturnType<PrismaService['role']['create']>>; 

describe('CacheController (e2e)', () => {
  let app: INestApplication;
  let redisService: RedisService;
  let prismaService: PrismaService;
  let user: User;
  let testRole: Role;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    redisService = moduleFixture.get<RedisService>(RedisService);
    prismaService = moduleFixture.get<PrismaService>(PrismaService);

    await app.init();
    await redisService.getClient().flushall(); // Clear Redis before tests

    // Clean up existing data before starting tests to ensure a clean slate
    await prismaService.user.deleteMany({});
    await prismaService.role.deleteMany({});

    // Create a role for testing first
    testRole = await prismaService.role.create({
      data: {
        name: 'Test Role',
        description: 'A role created for e2e testing.',
      },
    });

    // Create a user for testing, associating with the created role
    user = await prismaService.user.create({
      data: {
        email: 'test@example.com',
        name: 'Test User',
        bio: 'Test bio',
        roleId: testRole.id, // Associate user with the created role
      },
    });
  });

  afterAll(async () => {
    await prismaService.user.deleteMany({}); // Clean up users
    await prismaService.role.deleteMany({}); // Clean up roles
    await redisService.getClient().flushall(); // Clear Redis after tests
    await app.close();
  });

  beforeEach(async () => {
    // Clear cache before each test
    const client = redisService.getClient();
    await client.flushall();
  });

  describe('Cache Population', () => {
    it('should cache user after first read', async () => {
      // First request (cache miss)
      await request(app.getHttpServer())
        .get(`/users/${user.id}`)
        .expect(200);

      // Check if cached
      const cacheKey = `app:v1:user:${user.id}`;
      const cached = await redisService.get(cacheKey);

      expect(cached).toBeDefined();
      const cachedData = JSON.parse(cached!);
      expect(cachedData.id).toBe(user.id);
    });

    it('should cache paginated list', async () => {
      // First request
      await request(app.getHttpServer())
        .get('/users?page=1&limit=10')
        .expect(200);

      // Check if cached
      const cacheKey = 'app:v1:users:list:page-1:limit-10';
      const cached = await redisService.get(cacheKey);

      expect(cached).toBeDefined();
      const cachedData = JSON.parse(cached!);
      expect(cachedData.data).toBeInstanceOf(Array);
      expect(cachedData.pagination).toBeDefined();
    });
  });

  describe('Cache Hit', () => {
    it('should return cached data on second request', async () => {
      // First request (populate cache)
      const res1 = await request(app.getHttpServer())
        .get(`/users/${user.id}`)
        .expect(200);

      // Second request (should hit cache)
      const res2 = await request(app.getHttpServer())
        .get(`/users/${user.id}`)
        .expect(200);

      expect(res1.body).toEqual(res2.body);
    });

    it('should bypass database on cache hit', async () => {
      // Populate cache
      await request(app.getHttpServer()).get(`/users/${user.id}`);

      // Modify database directly (cache should still return old value)
      await prismaService.user.update({
        where: { id: user.id },
        data: { name: 'Modified Name' },
      });

      // Should still return cached value (old name)
      const res = await request(app.getHttpServer())
        .get(`/users/${user.id}`)
        .expect(200);

      // Cache returns old value until TTL expires
      expect(res.body.name).not.toBe('Modified Name');
    });
  });

  describe('TTL Expiry', () => {
    it('should reload data after TTL expires', async () => {
      const cacheKey = `app:v1:user:${user.id}`;

      // First request
      await request(app.getHttpServer()).get(`/users/${user.id}`);

      // Manually expire cache
      await redisService.getClient().expire(cacheKey, 1);
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Update database
      await prismaService.user.update({
        where: { id: user.id },
        data: { name: 'Updated Name' },
      });

      // Should fetch fresh data
      const res = await request(app.getHttpServer())
        .get(`/users/${user.id}`)
        .expect(200);

      expect(res.body.name).toBe('Updated Name');
    }, 10000);
  });

  describe('Redis Failure Handling', () => {
    it('should fallback to database when Redis is down', async () => {
      // Simulate Redis being down by disconnecting
      await redisService.getClient().quit();

      // Should still work (fallback to DB)
      const res = await request(app.getHttpServer())
        .get(`/users/${user.id}`)
        .expect(200);

      expect(res.body.id).toBe(user.id);

      // Reconnect Redis for other tests
      await redisService.onModuleInit();
    });
  });

  describe('Different Cache Keys', () => {
    it('should use different keys for different pages', async () => {
      await request(app.getHttpServer()).get('/users?page=1&limit=10');
      await request(app.getHttpServer()).get('/users?page=2&limit=10');

      const key1 = await redisService.get('app:v1:users:list:page-1:limit-10');
      const key2 = await redisService.get('app:v1:users:list:page-2:limit-10');

      expect(key1).toBeDefined();
      expect(key2).toBeDefined();
      expect(key1).not.toBe(key2);
    });
  });
});