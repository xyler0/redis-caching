import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CacheMetricsService } from './cache-metrics.service';

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: CacheMetricsService) {}

  @Get('cache')
  @ApiOperation({ summary: 'Get cache metrics' })
  async getCacheMetrics() {
    return this.metricsService.getMetrics();
  }

  @Post('cache/reset')
  @ApiOperation({ summary: 'Reset cache metrics' })
  async resetMetrics() {
    await this.metricsService.resetMetrics();
    return { message: 'Metrics reset successfully' };
  }
}