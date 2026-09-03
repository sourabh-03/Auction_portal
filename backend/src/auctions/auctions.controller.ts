import { Body, Controller, Get, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { TeamGuard } from '../auth/guards/team.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/auth.types';
import { AuctionsService } from './auctions.service';
import { AuctionViewService } from './auction-view.service';
import { CreateAuctionDto } from './dto/create-auction.dto';
import { UpdateAuctionConfigDto } from './dto/update-auction-config.dto';
import { CancelAuctionDto } from './dto/cancel-auction.dto';

@Controller('api/auctions')
@UseGuards(TeamGuard)
export class AuctionsController {
  constructor(
    private readonly auctions: AuctionsService,
    private readonly view: AuctionViewService,
  ) {}

  @Post()
  create(@Body() dto: CreateAuctionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.auctions.create(dto, user.id);
  }

  @Patch(':id/config')
  updateConfig(@Param('id') id: string, @Body() dto: UpdateAuctionConfigDto) {
    return this.auctions.updateConfig(id, dto);
  }

  @Post(':id/go-live')
  goLive(@Param('id') id: string) {
    return this.auctions.goLive(id);
  }

  @Post(':id/close-now')
  closeNow(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.auctions.closeNow(id, user.id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelAuctionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.auctions.cancel(id, user.id, dto.reason);
  }

  @Post(':id/send-result')
  sendResult(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.auctions.sendResult(id, user.id);
  }

  @Get('templates')
  templates() {
    return this.auctions.listTemplates();
  }

  @Get(':id/state')
  state(@Param('id') id: string) {
    return this.view.getTeamSnapshot(id);
  }

  @Get(':id/audit-log')
  auditLog(@Param('id') id: string) {
    return this.view.getAuditLog(id);
  }

  @Get(':id/audit-log/export')
  async auditLogExport(@Param('id') id: string, @Res() res: Response) {
    const csv = await this.view.exportAuditLogCsv(id);
    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${id}-audit-log.csv"`,
    });
    res.send(csv);
  }
}
