import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { VendorAuthService } from './vendor-auth.service';
import { LoginDto } from './dto/login.dto';
import { VendorGuard } from './guards/vendor.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/auth.types';

@Controller('auth/vendor')
export class VendorAuthController {
  constructor(private readonly vendorAuth: VendorAuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  login(@Body() dto: LoginDto) {
    return this.vendorAuth.login(dto.email, dto.password);
  }

  @Post('accept-nda')
  @HttpCode(HttpStatus.OK)
  @UseGuards(VendorGuard)
  acceptNda(@CurrentUser() user: AuthenticatedUser) {
    return this.vendorAuth.acceptNda(user.id);
  }
}
