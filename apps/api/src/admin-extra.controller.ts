import {
  Body,
  Controller,
  Post,
  Get,
  Query,
  NotFoundException,
  Param,
  Req,
  UseGuards,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import {
  IsString,
  IsIn,
  IsOptional,
  IsDateString,
  MinLength,
  MaxLength,
  Matches,
  IsBoolean,
} from 'class-validator';
import { Db } from './db';
import { AdminOnlyGuard, AccessGuard, ActorRequest, requireRole, passwordHash } from './security';
import { normalizeCode, validateTariffScope } from './hs';
import { EXTERNAL_ID_PATTERN, summarizeImportState } from './import-state';
class TariffDto {
  @ApiProperty() @IsString() @MaxLength(30) code!: string;
  @ApiProperty({ enum: [6, 8] }) @IsIn([6, 8]) level!: number;
  @ApiProperty({ enum: ['VN', 'WCO'] }) @IsIn(['VN', 'WCO']) market!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100) version!: string;
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(4000) source!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() effectiveFrom?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() effectiveTo?: string;
}
class ConfirmDto {
  @ApiProperty() @IsBoolean() confirmed!: boolean;
}
class UserDto {
  @ApiProperty() @IsString() @Matches(/^[a-zA-Z0-9_-]{3,50}$/) username!: string;
  @ApiProperty() @IsString() @MinLength(16) @MaxLength(150) password!: string;
  @ApiProperty({ enum: ['editor', 'reviewer', 'publisher'] })
  @IsIn(['editor', 'reviewer', 'publisher'])
  role!: string;
}
@ApiTags('Admin')
@Controller('admin')
@UseGuards(AccessGuard, AdminOnlyGuard)
export class AdminExtraController {
  constructor(private db: Db) {}
  @Post('users') async user(@Req() req: ActorRequest, @Body() dto: UserDto) {
    requireRole(req, ['admin']);
    const row = await this.db.user.create({
      data: { username: dto.username, role: dto.role, passwordHash: passwordHash(dto.password) },
    });
    await this.db.audit.create({
      data: {
        actorId: req.actor.userId!,
        action: 'user.create',
        targetId: row.id,
        detail: { role: row.role },
      },
    });
    return { id: row.id, username: row.username, role: row.role };
  }
  @Get('items/by-external/:externalId') async byExternal(
    @Req() req: ActorRequest,
    @Param('externalId') externalId: string,
  ) {
    requireRole(req, ['editor', 'reviewer', 'publisher', 'admin']);
    if (!EXTERNAL_ID_PATTERN.test(externalId))
      throw new BadRequestException('externalId không hợp lệ.');
    const item = await this.db.item.findUnique({
      where: { externalId },
      include: {
        revisions: {
          orderBy: { version: 'desc' },
          take: 1,
          include: { releases: true, media: { include: { asset: true } } },
        },
      },
    });
    if (!item || !item.revisions.length) throw new NotFoundException('Không tìm thấy mục.');
    const scenarios = await this.db.tradeScenario.findMany({
      where: { revisionId: item.revisions[0].id },
    });
    return summarizeImportState({
      externalId: item.externalId,
      revisions: item.revisions.map((r) => ({ ...r, scenarios })),
    });
  }
  @Get('tariffs') async findTariffs(
    @Req() req: ActorRequest,
    @Query('code') code: string,
    @Query('version') version: string,
    @Query('market') market: string,
  ) {
    requireRole(req, ['editor', 'reviewer', 'publisher', 'admin']);
    if (!['VN', 'WCO'].includes(market) || !version)
      throw new BadRequestException('Thiếu market hoặc version hợp lệ.');
    const rows = await this.db.tariffReference.findMany({
      where: { code: normalizeCode(code ?? '', 6), version, market },
      orderBy: { id: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      level: r.level,
      version: r.version,
      reviewedBy: r.reviewedBy,
    }));
  }
  @Post('tariffs') async tariff(@Req() req: ActorRequest, @Body() dto: TariffDto) {
    requireRole(req, ['editor', 'admin']);
    validateTariffScope(dto.market, dto.level);
    const code = normalizeCode(dto.code, dto.level);
    if (dto.effectiveFrom && dto.effectiveTo && dto.effectiveFrom > dto.effectiveTo)
      throw new BadRequestException('Khoảng hiệu lực không hợp lệ.');
    const row = await this.db.tariffReference.create({
      data: {
        ...dto,
        code,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
      },
    });
    await this.db.audit.create({
      data: { actorId: req.actor.userId!, action: 'tariff.create', targetId: row.id, detail: {} },
    });
    return row;
  }
  @Post('tariffs/:id/approve') async approveTariff(
    @Req() req: ActorRequest,
    @Param('id') id: string,
    @Body() dto: ConfirmDto,
  ) {
    requireRole(req, ['reviewer', 'admin']);
    if (!dto.confirmed) throw new BadRequestException('Cần xác nhận đã kiểm nguồn và hiệu lực.');
    await this.db.$transaction(async (tx) => {
      await tx.tariffReference.update({
        where: { id },
        data: { reviewedBy: req.actor.userId, reviewedAt: new Date() },
      });
      await tx.audit.create({
        data: { actorId: req.actor.userId!, action: 'tariff.approve', targetId: id, detail: {} },
      });
    });
    return { id, approved: true };
  }
  @Post('revisions/:id/clone') async clone(@Req() req: ActorRequest, @Param('id') id: string) {
    requireRole(req, ['editor', 'admin']);
    return this.db.$transaction(
      async (tx) => {
        const old = await tx.revision.findUniqueOrThrow({
          where: { id },
          include: { names: true, media: true },
        });
        const latest = await tx.revision.findFirstOrThrow({
          where: { itemId: old.itemId },
          orderBy: { version: 'desc' },
        });
        if (latest.status === 'draft' && latest.id !== old.id)
          throw new ConflictException('Đã có revision nháp mới hơn.');
        const created = await tx.revision.create({
          data: {
            itemId: old.itemId,
            version: latest.version + 1,
            status: 'draft',
            digest: old.digest,
            data: old.data!,
            createdBy: req.actor.userId!,
            names: {
              create: old.names.map((n) => ({
                kind: n.kind,
                label: n.label,
                aliases: n.aliases,
                acceptedForms: n.acceptedForms,
                searchText: n.searchText,
                source: n.source,
                pronunciation: n.pronunciation,
              })),
            },
            media: { create: old.media.map((m) => ({ assetId: m.assetId })) },
          },
        });
        const scenarios = await tx.tradeScenario.findMany({ where: { revisionId: id } });
        for (const s of scenarios)
          await tx.tradeScenario.create({
            data: { revisionId: created.id, tariffId: s.tariffId, data: s.data!, status: 'draft' },
          });
        await tx.audit.create({
          data: {
            actorId: req.actor.userId!,
            action: 'revision.clone',
            targetId: created.id,
            detail: { from: id },
          },
        });
        return { id: created.id, status: 'draft' };
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
