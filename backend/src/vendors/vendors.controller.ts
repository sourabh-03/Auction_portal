import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { VendorGuard } from '../auth/guards/vendor.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/auth.types';
import { VendorsService } from './vendors.service';
import { SubmitBidDto } from './dto/submit-bid.dto';
import { RespondDto } from './dto/respond.dto';

@Controller('api/vendor')
@UseGuards(VendorGuard)
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Get('auctions')
  listMyAuctions(@CurrentUser() user: AuthenticatedUser) {
    return this.vendors.listMyAuctions(user.id);
  }

  @Get('me')
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.vendors.getProfile(user.id);
  }

  @Get('activity')
  getActivity(@CurrentUser() user: AuthenticatedUser) {
    return this.vendors.getActivity(user.id);
  }

  @Get('auctions/:id/state')
  state(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.vendors.getState(id, user.id);
  }

  @Post('auctions/:id/bid')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 10000 } })
  submitBid(@Param('id') id: string, @Body() dto: SubmitBidDto, @CurrentUser() user: AuthenticatedUser) {
    return this.vendors.submitBid(id, user.id, dto.price);
  }

  @Post('auctions/:id/respond')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 10000 } })
  respond(@Param('id') id: string, @Body() dto: RespondDto, @CurrentUser() user: AuthenticatedUser) {
    return this.vendors.respond(id, user.id, dto.action);
  }
}
