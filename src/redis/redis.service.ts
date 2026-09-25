import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('REDIS_URL');

    this.client = new Redis(url ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      // Don't keep retrying forever if Redis is unreachable - caching is an
      // optimization, never something the app should depend on just to run.
      retryStrategy: () => null,
    });

    this.client.on('error', (err) => {
      // Swallowed deliberately: every method below already treats a failed
      // Redis call as "not cached" rather than throwing, so the app keeps
      // working normally (just without the speed-up) if Redis is ever down.
      console.warn('Redis connection issue (continuing without cache):', err.message);
    });
  }

  async getJson<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // A failed cache write just means the next read misses too - not
      // worth surfacing as an error to whoever called this.
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch {
      // ignore
    }
  }

  onModuleDestroy() {
    this.client.disconnect();
  }
}
