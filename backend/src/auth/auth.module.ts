import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { TeamAuthService } from './team-auth.service';
import { VendorAuthService } from './vendor-auth.service';
import { TeamAuthController } from './team-auth.controller';
import { VendorAuthController } from './vendor-auth.controller';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '12h') },
      }),
    }),
  ],
  controllers: [TeamAuthController, VendorAuthController],
  providers: [JwtStrategy, TeamAuthService, VendorAuthService],
  exports: [JwtModule],
})
export class AuthModule {}
