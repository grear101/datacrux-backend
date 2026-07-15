import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Attach this with @UseGuards(JwtAuthGuard) to any route that should only be
// reachable with a valid, signed token - this is what makes clientId trusted.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
