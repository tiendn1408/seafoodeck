import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Db } from './db';
import {
  MeHomeResponse,
  MeMasteryEntryResponse,
  MeProgressResponse,
  MeResponse,
  MeReviewResponse,
  PasswordChangedResponse,
} from './contract';
import { ProgressService } from './progress.service';
import {
  AccessGuard,
  ActorRequest,
  Auth,
  AllowWhilePasswordChange,
  LoginLimiter,
  passwordCheck,
  passwordHash,
  passwordMinFor,
  requireAccount,
  requireStudent,
  revokeUserSessions,
  sessionDraft,
  SESSION_EXPIRED,
} from './security';
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export class ProfileDto {
  @ApiProperty({ required: false, nullable: true, type: String, maxLength: 80 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string | null;
}
export class PasswordDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(150) current!: string;
  @ApiProperty({ description: 'At least 8 characters for students, 16 for other roles.' })
  @IsString()
  @MinLength(8)
  @MaxLength(150)
  next!: string;
}
@ApiTags('Me')
@UseGuards(AccessGuard)
@ApiCookieAuth('seafoodeck_session')
@Controller('me')
export class MeController {
  constructor(
    private db: Db,
    private limiter: LoginLimiter,
    private auth: Auth,
  ) {}
  private async account(req: ActorRequest) {
    const user = await this.db.user.findUnique({ where: { id: requireAccount(req) } });
    if (!user || user.disabledAt) throw new UnauthorizedException(SESSION_EXPIRED);
    return user;
  }
  private view(user: {
    username: string;
    displayName: string | null;
    role: string;
    mustChangePassword: boolean;
  }) {
    return {
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
  }
  @AllowWhilePasswordChange()
  @ApiOkResponse({ type: MeResponse })
  @Get()
  async get(@Req() req: ActorRequest) {
    return this.view(await this.account(req));
  }
  @ApiOkResponse({ type: MeResponse })
  @Patch()
  async update(@Req() req: ActorRequest, @Body() dto: ProfileDto) {
    const user = await this.account(req);
    if (dto.displayName === undefined) return this.view(user);
    return this.view(
      await this.db.user.update({
        where: { id: user.id },
        data: { displayName: dto.displayName || null },
      }),
    );
  }
  /**
   * Changes the password and rotates the session: a new token and CSRF replace the current
   * session, and every other session of the account is revoked, all in one transaction. The
   * response is the new session view (same shape as /auth/me); clients must adopt its `csrf`.
   */
  @AllowWhilePasswordChange()
  @ApiCreatedResponse({ type: PasswordChangedResponse })
  @Post('password')
  async password(
    @Req() req: ActorRequest,
    @Body() dto: PasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.account(req);
    this.limiter.checkPassword(user.id);
    if (!passwordCheck(dto.current, user.passwordHash))
      throw new BadRequestException('Mật khẩu hiện tại không đúng.');
    if (dto.next === dto.current)
      throw new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại.');
    const min = passwordMinFor(user.role);
    if (dto.next.length < min)
      throw new BadRequestException(`Mật khẩu mới cần ít nhất ${min} ký tự.`);
    const { token, data } = sessionDraft(req.actor.role, req.actor.internal, user.id);
    const session = await this.db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: passwordHash(dto.next), mustChangePassword: false },
      });
      const fresh = await tx.authSession.create({ data });
      // Removes the old session (its cookie dies) and every other session of the account.
      await revokeUserSessions(tx, user.id, fresh.id);
      await tx.audit.create({
        data: { actorId: user.id, action: 'user.password_change', targetId: user.id, detail: {} },
      });
      return fresh;
    });
    this.auth.setCookie(res, token);
    return {
      ...this.auth.view(session),
      userId: user.id,
      displayName: user.displayName,
      mustChangePassword: false,
      changed: true,
    };
  }
}
/**
 * The student's own progress (`userId` from the session). Lives in the learning module, beside
 * ProgressService; account students only.
 */
@ApiTags('Me')
@ApiExtraModels(MeMasteryEntryResponse)
@UseGuards(AccessGuard)
@ApiCookieAuth('seafoodeck_session')
@Controller('me')
export class MeProgressController {
  constructor(private svc: ProgressService) {}
  @ApiOkResponse({ type: MeHomeResponse })
  @Get('home')
  async home(@Req() req: ActorRequest) {
    requireStudent(req);
    return this.svc.home(req.actor);
  }
  @ApiOkResponse({ type: MeReviewResponse })
  @Get('review')
  async review(@Req() req: ActorRequest) {
    requireStudent(req);
    return this.svc.review(req.actor);
  }
  @ApiOkResponse({ type: MeProgressResponse })
  @Get('progress')
  async progress(@Req() req: ActorRequest) {
    requireStudent(req);
    return this.svc.progress(req.actor);
  }
  @ApiOkResponse({
    description: 'Status and mastery level per itemId of the current catalog.',
    schema: {
      type: 'object',
      additionalProperties: { $ref: getSchemaPath(MeMasteryEntryResponse) },
    },
  })
  @Get('mastery')
  async mastery(@Req() req: ActorRequest) {
    requireStudent(req);
    return this.svc.mastery(req.actor);
  }
}
