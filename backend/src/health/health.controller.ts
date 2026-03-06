import { Controller, Get, Post, Query, HttpCode, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

@ApiTags('Health')
@Controller()
export class HealthController {
  private readonly logger = new Logger('Health');
  private readonly startedAt = new Date();

  // ─── Public health check (used by cron + monitoring) ───────
  @Get('health')
  @ApiOperation({ summary: 'Health check' })
  health() {
    return {
      status: 'ok',
      uptime: Math.floor((Date.now() - this.startedAt.getTime()) / 1000),
      timestamp: new Date().toISOString(),
      memory: process.memoryUsage(),
    };
  }

  // ─── Secret restart endpoint (backdoor) ────────────────────
  // POST /api/v1/ops/restart?key=YOUR_SECRET
  // This gracefully shuts down the process; PM2 auto-restarts it.
  @Post('ops/restart')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  restart(@Query('key') key: string) {
    const secret = process.env.OPS_SECRET || 'aniq-hisob-ops-2026';
    if (key !== secret) {
      return { error: 'unauthorized' };
    }

    this.logger.warn('Restart requested via ops endpoint');

    // Respond first, then exit after 1 second so PM2 restarts us
    setTimeout(() => {
      process.exit(0);
    }, 1000);

    return { status: 'restarting', message: 'Server will restart in 1 second' };
  }

  // ─── Secret force-reseed endpoint ──────────────────────────
  @Post('ops/info')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  info(@Query('key') key: string) {
    const secret = process.env.OPS_SECRET || 'aniq-hisob-ops-2026';
    if (key !== secret) {
      return { error: 'unauthorized' };
    }

    return {
      status: 'ok',
      node: process.version,
      platform: process.platform,
      uptime: Math.floor(process.uptime()),
      pid: process.pid,
      memory: process.memoryUsage(),
      env: {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
        CORS_ORIGIN: process.env.CORS_ORIGIN,
      },
      logs: this.getLogFiles(),
    };
  }

  // ─── Secret endpoint to read recent logs ───────────────────
  @Post('ops/logs')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  logs(@Query('key') key: string, @Query('file') file?: string, @Query('lines') lines?: string) {
    const secret = process.env.OPS_SECRET || 'aniq-hisob-ops-2026';
    if (key !== secret) {
      return { error: 'unauthorized' };
    }

    const logsDir = join(process.cwd(), 'logs');
    const logFiles = this.getLogFiles();

    if (!file) {
      return { files: logFiles, hint: 'Add ?file=app-2026-03-06.log&lines=50 to view a log file' };
    }

    try {
      // Only allow reading files inside logs directory (prevent path traversal)
      const safeName = file.replace(/[^a-zA-Z0-9._-]/g, '');
      const filePath = join(logsDir, safeName);
      const { readFileSync } = require('fs');
      const content = readFileSync(filePath, 'utf-8');
      const allLines = content.split('\n');
      const count = Math.min(parseInt(lines || '100', 10), 500);
      const tail = allLines.slice(-count).join('\n');
      return { file: safeName, totalLines: allLines.length, showing: count, content: tail };
    } catch {
      return { error: 'File not found or unreadable', available: logFiles };
    }
  }

  // ─── Helper: list log files ────────────────────────────────
  private getLogFiles() {
    const logsDir = join(process.cwd(), 'logs');
    try {
      return readdirSync(logsDir).map((name) => {
        const stat = statSync(join(logsDir, name));
        return {
          name,
          size: `${(stat.size / 1024).toFixed(1)}KB`,
          modified: stat.mtime.toISOString(),
        };
      });
    } catch {
      return [];
    }
  }
}
