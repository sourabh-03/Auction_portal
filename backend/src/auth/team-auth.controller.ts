import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { TeamAuthService } from './team-auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth/team')
export class TeamAuthController {
  constructor(private readonly teamAuth: TeamAuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  login(@Body() dto: LoginDto) {
    return this.teamAuth.login(dto.email, dto.password);
  }
}
