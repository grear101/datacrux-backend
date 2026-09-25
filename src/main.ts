import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Railway sits in front of this app as a reverse proxy, so every request
  // technically arrives "from" Railway's own address unless we tell Express
  // to trust the proxy and read the real client IP out of the
  // X-Forwarded-For header instead. Without this, the rate limiter below
  // would see every single customer as the same one IP and either block
  // everyone together or nobody at all.
  app.set('trust proxy', 1);

  // Global validation: every DTO is checked, unexpected fields are stripped,
  // and requests with extra/invalid fields are rejected outright.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Datacrux backend running on port ${port}`);
}
bootstrap();
