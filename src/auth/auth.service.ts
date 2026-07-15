import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string) {
    const admin = await this.prisma.adminUser.findUnique({ where: { email } });

    // Same message whether the email doesn't exist or the password is wrong -
    // never reveal which one it was, that would let someone probe for valid emails.
    if (!admin) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const passwordMatches = await bcrypt.compare(password, admin.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    // This payload is what every future request will trust as "who is this
    // and which tenant do they belong to" - it's cryptographically signed,
    // so it can't be tampered with without the server's JWT_SECRET.
    const payload = {
      sub: admin.id,
      clientId: admin.clientId,
      role: admin.role,
      email: admin.email,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      admin: {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        clientId: admin.clientId,
      },
    };
  }
}
