import { Body, Controller, Get, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { IsString, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Auth, LoginLimiter, passwordMatches, hash } from './security';
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
  @Get('me') async me(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.view(await this.auth.actor(req, res));
  }
  @Post('login') async login(
    @Body() data: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const before = await this.auth.actor(req);
    this.auth.checkWrite(req, before);
    this.limiter.check(req.ip ?? 'unknown');
    let role = 'learner',
      userId: string | undefined;
    if (data.username) {
      const user = await this.db.user.findUnique({ where: { username: data.username } });
      if (!user || !passwordMatches(data.credential, user.passwordHash))
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
    return this.auth.view(after);
  }
  @Post('logout') async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const before = await this.auth.actor(req);
    this.auth.checkWrite(req, before);
    await this.db.authSession.delete({ where: { id: before.id } });
    return this.auth.view(await this.auth.create(res, 'guest', false));
  }
}
