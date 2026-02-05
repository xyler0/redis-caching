import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { UsersModule } from './users/users.module';
import 'dotenv/config';

@Module({
    imports: [UsersModule, PrismaModule, RedisModule],
})
export class AppModule {}