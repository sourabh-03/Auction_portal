import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../common/types/auth.types';

@Injectable()
export class VendorAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { email } });
    if (!vendor || !vendor.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const matches = await bcrypt.compare(password, vendor.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const payload: JwtPayload = { sub: vendor.id, kind: 'vendor', email: vendor.email };
    return {
      accessToken: this.jwt.sign(payload),
      vendor: {
        id: vendor.id,
        companyName: vendor.companyName,
        email: vendor.email,
        ndaAccepted: vendor.ndaAcceptedAt != null,
      },
    };
  }

  // §6.3 — a vendor accepts the NDA once, ever, not per auction. Gates the
  // vendor's first bid submission across every auction, not just one.
  async acceptNda(vendorId: string) {
    const vendor = await this.prisma.vendor.update({
      where: { id: vendorId },
      data: { ndaAcceptedAt: new Date() },
    });
    return { ndaAcceptedAt: vendor.ndaAcceptedAt };
  }
}
