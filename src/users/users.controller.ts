import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CacheInterceptor } from '../cache/cache.interceptor';
import { Cached } from '../cache/cache.decorator';
import { CacheKeyBuilder, CacheTTL } from '../cache/cache-key.util';

@ApiTags('users')
@Controller('users')
@UseInterceptors(CacheInterceptor)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  @Cached({
    ttl: CacheTTL.USER,
    keyBuilder: (params) => CacheKeyBuilder.build('user', params.id),
  })
  @ApiOperation({ summary: 'Get user by ID (cached)' })
  @ApiResponse({ status: 200, description: 'User found' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Get()
  @Cached({
    ttl: CacheTTL.USER_LIST,
    keyBuilder: (params, query) =>
      CacheKeyBuilder.buildList('users', {
        page: parseInt(query.page || '1'),
        limit: parseInt(query.limit || '10'),
      }),
  })
  @ApiOperation({ summary: 'Get all users (paginated, cached)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Users retrieved' })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.usersService.findAll(
      parseInt(page || '1'),
      parseInt(limit || '10'),
    );
  }
}