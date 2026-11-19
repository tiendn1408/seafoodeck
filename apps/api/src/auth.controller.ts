import { Body, Controller, Get, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { IsString, MaxLength, IsOptional } from 'class-validator';
import { ApiOkResponse, ApiProperty } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Auth, LoginLimiter, passwordCheck, hash, AllowWhilePasswordChange } from './security';
import { AuthMeResponse } from './contract';
import { Db } from './db';
class LoginDto {
  @ApiProperty() @IsString() @MaxLength(150) credential!: string;
  @ApiProperty({ required: false }) @IsString() @MaxLength(80) @IsOptional() username?: string;
}
@Controller('auth')
export class AuthController {
  constructor(
    private auth: Auth,
    private db: Db,
    private limiter: LoginLimiter,
  ) {}
  @AllowWhilePasswordChange()
  @ApiOkResponse({ type: AuthMeResponse })
  @Get('me')
  async me(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const actor = await this.auth.actor(req, res);
    const view = this.auth.view(actor);
    if (!actor.userId) return view;
    const user = await this.db.user.findUnique({
      where: { id: actor.userId },
      select: { displayName: true, mustChangePassword: true },
    });
    if (!user) return view;
    return { ...view, userId: actor.userId, ...user };
  }
  @Post('login') async login(
    @Body() data: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const before = await this.auth.actor(req);
    this.auth.checkWrite(req, before);
    this.limiter.check(req.ip ?? 'unknown', data.username || undefined);
    let role = 'learner',
      userId: string | undefined;
    if (data.username) {
      const user = await this.db.user.findUnique({ where: { username: data.username } });
      // Disabled accounts share the wrong-password response and its scrypt cost.
      if (!passwordCheck(data.credential, user?.passwordHash) || !user || user.disabledAt)
        throw new UnauthorizedException('Thông tin đăng nhập không hợp lệ.');
      role = user.role;
      userId = user.id;
    } else if (
      !process.env.LEARNER_INVITE_CODE ||
      hash(data.credential) !== hash(process.env.LEARNER_INVITE_CODE)
    )
      throw new UnauthorizedException('Mã mời không hợp lệ.');
    const after = await this.auth.create(
      res,
      role,
      process.env.ALLOW_INTERNAL_DEMO === 'true',
      userId,
    );
    await this.db.authSession.delete({ where: { id: before.id } });
    if (userId)
      await this.db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
    return this.auth.view(after);
  }
  @AllowWhilePasswordChange()
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const before = await this.auth.actor(req);
    this.auth.checkWrite(req, before);
    await this.db.authSession.delete({ where: { id: before.id } });
    return this.auth.view(await this.auth.create(res, 'guest', false));
  }
}
