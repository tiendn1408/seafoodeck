import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Db } from './db';
import { MeResponse, PasswordChangedResponse } from './contract';
import {
  AccessGuard,
  ActorRequest,
  AllowWhilePasswordChange,
  passwordCheck,
  passwordHash,
  passwordMinFor,
  requireAccount,
  revokeUserSessions,
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
  constructor(private db: Db) {}
  private async account(req: ActorRequest) {
    const user = await this.db.user.findUnique({ where: { id: requireAccount(req) } });
    if (!user || user.disabledAt) throw new UnauthorizedException('Phiên hết hạn.');
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
  @AllowWhilePasswordChange()
  @ApiCreatedResponse({ type: PasswordChangedResponse })
  @Post('password')
  async password(@Req() req: ActorRequest, @Body() dto: PasswordDto) {
    const user = await this.account(req);
    if (!passwordCheck(dto.current, user.passwordHash))
      throw new BadRequestException('Mật khẩu hiện tại không đúng.');
    const min = passwordMinFor(user.role);
    if (dto.next.length < min)
      throw new BadRequestException(`Mật khẩu mới cần ít nhất ${min} ký tự.`);
    await this.db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: passwordHash(dto.next), mustChangePassword: false },
      });
      await revokeUserSessions(tx, user.id, req.actor.id);
      await tx.audit.create({
        data: { actorId: user.id, action: 'user.password_change', targetId: user.id, detail: {} },
      });
    });
    return { changed: true };
  }
}
