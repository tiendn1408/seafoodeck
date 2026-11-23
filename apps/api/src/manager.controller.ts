import { Controller, Get, NotFoundException, Param, Req, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { Db } from './db';
import {
  ManagerLearnerResponse,
  MeMasteryEntryResponse,
  MeProgressResponse,
  MeReviewResponse,
} from './contract';
import { ProgressService } from './progress.service';
import { AccessGuard, ActorRequest, requireManager } from './security';

/**
 * Read-only per-learner views for managers and admins. Progress reuses ProgressService, so each
 * response is the same JSON `/me/*` returns for that learner. Only `student` accounts are
 * addressable (any other id, including the caller's, is 404); locked students stay visible.
 */
@ApiTags('Manager')
@ApiExtraModels(MeMasteryEntryResponse)
@UseGuards(AccessGuard)
@ApiCookieAuth('seafoodeck_session')
@Controller('manager/learners')
export class ManagerController {
  constructor(
    private db: Db,
    private svc: ProgressService,
  ) {}
  private async student(req: ActorRequest, id: string) {
    requireManager(req);
    const user = await this.db.user.findUnique({ where: { id } });
    if (!user || user.role !== 'student') throw new NotFoundException('Không tìm thấy học viên.');
    return user;
  }
  @ApiOkResponse({ type: ManagerLearnerResponse })
  @Get(':id')
  async learner(@Req() req: ActorRequest, @Param('id') id: string) {
    const u = await this.student(req, id);
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      disabled: u.disabledAt !== null,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    };
  }
  @ApiOkResponse({ type: MeReviewResponse })
  @Get(':id/review')
  async review(@Req() req: ActorRequest, @Param('id') id: string) {
    return this.svc.review(req.actor, Date.now(), (await this.student(req, id)).id);
  }
  @ApiOkResponse({ type: MeProgressResponse })
  @Get(':id/progress')
  async progress(@Req() req: ActorRequest, @Param('id') id: string) {
    return this.svc.progress(req.actor, Date.now(), (await this.student(req, id)).id);
  }
  @ApiOkResponse({
    description: 'Status and mastery level per itemId of the current catalog.',
    schema: {
      type: 'object',
      additionalProperties: { $ref: getSchemaPath(MeMasteryEntryResponse) },
    },
  })
  @Get(':id/mastery')
  async mastery(@Req() req: ActorRequest, @Param('id') id: string) {
    return this.svc.mastery(req.actor, Date.now(), (await this.student(req, id)).id);
  }
}
