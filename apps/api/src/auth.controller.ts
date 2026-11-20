import { Body, Controller, Get, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { IsString, MaxLength, IsOptional } from 'class-validator';
import { ApiOkResponse, ApiProperty } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Auth, LoginLimiter, passwordCheck, hash, AllowWhilePasswordChange } from './security';
import { AuthMeResponse } from './contract';
import { Db } from './db';
import { findUserByUsername } from './users';
import type { AuthSession } from './generated/prisma/client';
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
    return this.viewWithProfile(await this.auth.actor(req, res));
  }
  /** Session view plus the account profile (userId, displayName, mustChangePassword) when it has one. */
  private async viewWithProfile(actor: AuthSession) {
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
    const ip = req.ip ?? 'unknown';
    const username = data.username || undefined;
    this.limiter.check(ip, username);
    // check() reserved a slot; a failure keeps it, so concurrent guesses cannot outrun the limit.
    const reject = (message: string): never => {
      throw new UnauthorizedException(message);
    };
    let role = 'learner',
      userId: string | undefined;
    if (data.username) {
      const user = await findUserByUsername(this.db, data.username);
      // Disabled accounts share the wrong-password response and its scrypt cost.
      if (!passwordCheck(data.credential, user?.passwordHash) || !user || user.disabledAt)
        return reject('Thông tin đăng nhập không hợp lệ.');
      role = user.role;
      userId = user.id;
    } else if (
      !process.env.LEARNER_INVITE_CODE ||
      hash(data.credential) !== hash(process.env.LEARNER_INVITE_CODE)
    )
      return reject('Mã mời không hợp lệ.');
    this.limiter.succeed(ip, username);
    const after = await this.auth.create(
      res,
      role,
      process.env.ALLOW_INTERNAL_DEMO === 'true',
      userId,
    );
    await this.db.authSession.delete({ where: { id: before.id } });
    if (userId)
      await this.db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
    return this.viewWithProfile(after);
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
