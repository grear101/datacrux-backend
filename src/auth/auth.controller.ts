import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  // Login gets its own much stricter limit than the app-wide default: 5
  // attempts per minute per IP. Wrong-password attempts are the one place
  // someone might actually try to brute-force their way in, so this route
  // is deliberately tighter than everywhere else.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }
}
