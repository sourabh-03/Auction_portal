import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ThreadStatus } from '@prisma/client';
import { TeamGuard } from '../auth/guards/team.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/auth.types';
import { ThreadsService } from './threads.service';
import { CreateThreadDto } from './dto/create-thread.dto';

@Controller('api/threads')
@UseGuards(TeamGuard)
export class ThreadsController {
  constructor(private readonly threads: ThreadsService) {}

  @Get()
  list(@Query('status') status?: ThreadStatus) {
    return this.threads.list(status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.threads.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateThreadDto, @CurrentUser() user: AuthenticatedUser) {
    return this.threads.create(dto, user.id);
  }
}
