import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { TeamGuard } from '../auth/guards/team.guard';
import { VendorGuard } from '../auth/guards/vendor.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/auth.types';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Not enumerated in spec §10's REST table (which focuses on the auction
 * lifecycle) but necessary plumbing for the explicitly in-scope in-portal
 * notification bell icon (§13). Portal notifications only — email/SMS rows
 * exist for audit purposes but aren't re-served through this API.
 */
@Controller('api/notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @UseGuards(TeamGuard)
  listTeam(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.notification.findMany({
      where: { recipientType: 'auction_team', recipientId: user.id, channel: 'portal' },
      orderBy: { sentAt: 'desc' },
      take: 50,
    });
  }

  @Get('vendor')
  @UseGuards(VendorGuard)
  listVendor(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.notification.findMany({
      where: { recipientType: 'vendor', recipientId: user.id, channel: 'portal' },
      orderBy: { sentAt: 'desc' },
      take: 50,
    });
  }

  // Scoped with recipientId in the WHERE clause (updateMany, not update-by-id
  // alone) — otherwise any authenticated principal could mark, or at least
  // probe the existence of, another party's notification by guessing its id.
  @Patch(':id/read')
  @UseGuards(TeamGuard)
  markReadTeam(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.prisma.notification.updateMany({
      where: { id, recipientType: 'auction_team', recipientId: user.id },
      data: { readAt: new Date() },
    });
  }

  @Patch('vendor/:id/read')
  @UseGuards(VendorGuard)
  markReadVendor(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.prisma.notification.updateMany({
      where: { id, recipientType: 'vendor', recipientId: user.id },
      data: { readAt: new Date() },
    });
  }
}
