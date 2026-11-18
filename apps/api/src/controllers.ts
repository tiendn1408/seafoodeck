import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ConflictException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';
import {
  ApiProperty,
  ApiTags,
  ApiConsumes,
  ApiBody,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { Db } from './db';
import type { Prisma } from './generated/prisma/client';
import {
  CatalogItemResponse,
  CatalogPageResponse,
  SignedUrlResponse,
  GameResponse,
  ScoreResponse,
  RevealResponse,
} from './contract';
import { validateHs, type HsData } from './hs';
import { AccessGuard, ActorRequest, requireRole, AdminOnlyGuard, EditingGuard } from './security';
import { Catalog, csvHeader, readCsv, validateItem, Kind } from './catalog';
import { Media, discard, MediaInfo } from './media';
import { Learning } from './learning';
class StartDto {
  @ApiProperty({ enum: ['flashcard', 'match', 'image', 'hs', 'full', 'review', 'listening'] })
  @IsIn(['flashcard', 'match', 'image', 'hs', 'full', 'review', 'listening'])
  mode!: string;
  @ApiProperty({ required: false, enum: ['en', 'ja', 'scientific'] })
  @IsOptional()
  @IsIn(['en', 'ja', 'scientific'])
  kind?: Kind;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(100) revisionId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(100) reviewOf?: string;
  @ApiProperty({ required: false, type: [Object] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  reviewTargets?: { targetId: string; skill: string }[];
}
class AnswerDto {
  @ApiProperty() @IsString() @MaxLength(100) key!: string;
  @ApiProperty({ type: Object }) @IsObject() answer!: Record<string, unknown>;
}
class PublishDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(2000)
  revisionIds!: string[];
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() internal?: boolean;
}
class ImportDto {
  @ApiProperty() @IsString() @MaxLength(2097152) csv!: string;
}
class ItemDto {
  @ApiProperty({ type: Object }) @IsObject() item!: Record<string, unknown>;
}
class MediaApprovalDto {
  @ApiProperty() @IsBoolean() confirmIdentification!: boolean;
}
class ScenarioDto {
  @ApiProperty() @IsString() revisionId!: string;
  @ApiProperty({ type: Object }) @IsObject() data!: Record<string, unknown>;
  @ApiProperty({ required: false }) @IsOptional() @IsString() tariffId?: string;
}
@ApiTags('Catalog')
@UseGuards(AccessGuard)
@ApiCookieAuth('seafoodeck_session')
@Controller('catalog')
export class CatalogController {
  constructor(private catalog: Catalog) {}
  @ApiOkResponse({ type: CatalogPageResponse })
  @Get('items')
  list(
    @Req() req: ActorRequest,
    @Query('page') page = '1',
    @Query('limit') limit = '12',
    @Query('q') q = '',
    @Query('group') group = '',
    @Query('learnable') learnable = 'false',
    @Query('taxon') taxon = '',
  ) {
    return this.catalog.list(
      req.actor,
      Number(page),
      Number(limit),
      q,
      group,
      learnable === 'true',
      taxon,
    );
  }
  @ApiOkResponse({ type: CatalogItemResponse })
  @Get('items/:revisionId')
  detail(@Req() req: ActorRequest, @Param('revisionId') id: string) {
    return this.catalog.detail(req.actor, id);
  }
}
@ApiTags('Media')
@UseGuards(AccessGuard)
@ApiCookieAuth('seafoodeck_session')
@Controller('media')
export class MediaController {
  constructor(private media: Media) {}
  @ApiOkResponse({ type: SignedUrlResponse })
  @Get(':id/url')
  signed(
    @Req() req: ActorRequest,
    @Param('id') id: string,
    @Query('thumbnail') thumbnail = 'false',
  ) {
    return this.media.authorized(req.actor, id, thumbnail === 'true');
  }
}
@ApiTags('Learning')
@UseGuards(AccessGuard)
@ApiCookieAuth('seafoodeck_session')
@Controller('learning')
export class LearningController {
  constructor(private learning: Learning) {}
  @ApiCreatedResponse({ type: GameResponse })
  @Post('sessions')
  start(@Req() req: ActorRequest, @Body() dto: StartDto) {
    return this.learning.start(
      req.actor,
      dto.mode,
      dto.kind,
      dto.revisionId,
      dto.reviewOf,
      dto.reviewTargets,
    );
  }
  @ApiOkResponse({ type: GameResponse })
  @Get('sessions/:id')
  view(@Req() req: ActorRequest, @Param('id') id: string) {
    return this.learning.view(req.actor, id);
  }
  @ApiCreatedResponse({ type: RevealResponse })
  @Post('sessions/:id/questions/:qid/reveal')
  reveal(@Req() req: ActorRequest, @Param('id') id: string, @Param('qid') qid: string) {
    return this.learning.reveal(req.actor, id, qid);
  }
  @ApiCreatedResponse({ type: ScoreResponse })
  @Post('sessions/:id/questions/:qid/attempts')
  answer(
    @Req() req: ActorRequest,
    @Param('id') id: string,
    @Param('qid') qid: string,
    @Body() dto: AnswerDto,
  ) {
    return this.learning.submit(req.actor, id, qid, dto.key, dto.answer);
  }
}
@ApiTags('Admin')
@UseGuards(AccessGuard, AdminOnlyGuard)
@ApiCookieAuth('seafoodeck_session')
@Controller('admin')
export class AdminController {
  constructor(
    private db: Db,
    private catalog: Catalog,
    private media: Media,
  ) {}
  @Get('overview') async overview(@Req() req: ActorRequest, @Query('q') query = '') {
    requireRole(req, ['editor', 'reviewer', 'publisher', 'admin']);
    if (typeof query !== 'string' || query.length > 100)
      throw new BadRequestException('Từ khóa tối đa 100 ký tự.');
    const where: Prisma.RevisionWhereInput = query
      ? {
          OR: [
            { item: { externalId: { contains: query, mode: 'insensitive' } } },
            { names: { some: { searchText: { contains: query, mode: 'insensitive' } } } },
          ],
        }
      : {};
    return {
      revisionTotal: await this.db.revision.count({ where }),
      revisions: await this.db.revision.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { names: true, media: { include: { asset: true } } },
      }),
      releases: await this.db.contentRelease.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: { items: true },
      }),
      tariffs: await this.db.tariffReference.findMany({ take: 100 }),
      scenarios: await this.db.tradeScenario.findMany({ take: 100, include: { tariff: true } }),
      audit: await this.db.audit.findMany({ take: 50, orderBy: { at: 'desc' } }),
    };
  }
  @Get('csv-template') template(@Req() req: ActorRequest) {
    requireRole(req, ['editor', 'admin']);
    return { csv: csvHeader + '\n' };
  }
  @Post('import/preview') preview(@Req() req: ActorRequest, @Body() dto: ImportDto) {
    requireRole(req, ['editor', 'admin']);
    const result = readCsv(dto.csv);
    return { count: result.count, errors: result.errors, items: result.items };
  }
  @Post('import') async import(@Req() req: ActorRequest, @Body() dto: ImportDto) {
    requireRole(req, ['editor', 'admin']);
    const result = readCsv(dto.csv);
    if (result.errors.length)
      throw new BadRequestException({
        message: 'Không nhập phần nào khi CSV có lỗi.',
        errors: result.errors,
      });
    return {
      revisionIds: await this.catalog.import(result.items, req.actor.userId ?? req.actor.id),
    };
  }
  @Post('items') create(@Req() req: ActorRequest, @Body() dto: ItemDto) {
    requireRole(req, ['editor', 'admin']);
    return this.catalog.import([validateItem(dto.item)], req.actor.userId ?? req.actor.id);
  }
  @Post('revisions/:id/submit') async submit(@Req() req: ActorRequest, @Param('id') id: string) {
    requireRole(req, ['editor', 'admin']);
    const result = await this.db.revision.updateMany({
      where: { id, status: 'draft' },
      data: { status: 'review' },
    });
    if (!result.count) throw new ConflictException('Chỉ gửi duyệt revision nháp.');
    await this.db.audit.create({
      data: {
        actorId: req.actor.userId ?? req.actor.id,
        action: 'revision.submit',
        targetId: id,
        detail: {},
      },
    });
    return { id, status: 'review' };
  }
  @Post('revisions/:id/approve') approve(@Req() req: ActorRequest, @Param('id') id: string) {
    requireRole(req, ['reviewer', 'admin']);
    return this.catalog.review(id, req.actor.userId ?? req.actor.id);
  }
  @Post('releases') publish(@Req() req: ActorRequest, @Body() dto: PublishDto) {
    requireRole(req, ['publisher', 'admin']);
    return this.catalog.publish(
      dto.revisionIds,
      req.actor.userId ?? req.actor.id,
      dto.internal ?? false,
    );
  }
  @Post('releases/:id/rollback') async rollback(@Req() req: ActorRequest, @Param('id') id: string) {
    requireRole(req, ['publisher', 'admin']);
    return this.db.$transaction(async (tx) => {
      const release = await tx.contentRelease.findUniqueOrThrow({ where: { id } });
      const setting = release.internal ? 'current:internal' : 'current:public';
      await tx.setting.upsert({
        where: { id: setting },
        create: { id: setting, value: id },
        update: { value: id },
      });
      await tx.audit.create({
        data: {
          actorId: req.actor.userId ?? req.actor.id,
          action: 'release.rollback',
          targetId: id,
          detail: {},
        },
      });
      return { id };
    });
  }
  @Post('revisions/:id/media')
  @UseGuards(EditingGuard)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        source: { type: 'string' },
        credit: { type: 'string' },
        rights: { type: 'string' },
        role: { type: 'string' },
        nameKind: { type: 'string' },
        aiGenerated: { type: 'string', enum: ['true', 'false'] },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      dest: '/tmp/seafoodeck-upload',
      limits: { fileSize: 10485760, files: 1, fields: 12, fieldSize: 12000 },
    }),
  )
  async upload(
    @Req() req: ActorRequest,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    requireRole(req, ['editor', 'admin']);
    if (!file) throw new BadRequestException('Cần file.');
    try {
      const rev = await this.db.revision.findUniqueOrThrow({ where: { id } });
      if (
        rev.status !== 'draft' ||
        (await this.db.releaseItem.count({ where: { revisionId: id } }))
      )
        throw new ConflictException('Tạo revision nháp mới trước khi thay media.');
      if (!['true', 'false'].includes(req.body.aiGenerated))
        throw new BadRequestException('Cần khai rõ AI true/false.');
      const asset = await this.media.upload(file.path, {
        ...req.body,
        aiGenerated: req.body.aiGenerated === 'true',
      } as MediaInfo);
      await this.db.$transaction(
        async (tx) => {
          if (await tx.releaseItem.count({ where: { revisionId: id } }))
            throw new ConflictException(
              'Revision đã được xuất bản trong lúc upload; tạo nháp mới.',
            );
          await tx.mediaLink.deleteMany({
            where: { revisionId: id, asset: { role: asset.role, nameKind: asset.nameKind } },
          });
          await tx.mediaLink.create({ data: { revisionId: id, assetId: asset.id } });
        },
        { isolationLevel: 'Serializable' },
      );
      await this.db.audit.create({
        data: {
          actorId: req.actor.userId ?? req.actor.id,
          action: 'media.upload',
          targetId: asset.id,
          detail: { revisionId: id },
        },
      });
      return { id: asset.id, status: asset.status };
    } finally {
      await discard(file.path);
    }
  }
  @Post('media/:id/approve') async approveMedia(
    @Req() req: ActorRequest,
    @Param('id') id: string,
    @Body() dto: MediaApprovalDto,
  ) {
    requireRole(req, ['reviewer', 'admin']);
    const asset = await this.db.mediaAsset.findUniqueOrThrow({ where: { id } });
    if (
      asset.revokedAt ||
      (asset.role === 'identification' &&
        (!dto.confirmIdentification ||
          asset.aiGenerated ||
          !(asset.metadata as { originalImageId?: string }).originalImageId))
    )
      throw new BadRequestException('Cần duyệt riêng nhận diện ảnh thật.');
    if (asset.role === 'pronunciation') {
      const metadata = asset.metadata as {
        locale?: string;
        voice?: string;
        spokenLabel?: string;
        readingConvention?: string;
      };
      const links = await this.db.mediaLink.findMany({
        where: { assetId: id },
        include: { revision: { include: { names: true } } },
      });
      if (
        !metadata.locale ||
        !metadata.voice ||
        !metadata.spokenLabel ||
        !links.length ||
        links.some(
          (l) =>
            !l.revision.names.some(
              (n) =>
                n.kind === asset.nameKind && n.label === metadata.spokenLabel && !!n.pronunciation,
            ),
        ) ||
        (asset.nameKind === 'scientific' && !metadata.readingConvention)
      )
        throw new BadRequestException(
          'Bản thu cần giọng/locale, tên đọc khớp phiên bản, hướng dẫn đọc và quy ước tên khoa học trước khi duyệt.',
        );
    }
    return this.db.$transaction(async (tx) => {
      const row = await tx.mediaAsset.update({
        where: { id },
        data: {
          status: 'approved',
          reviewedBy: req.actor.userId ?? req.actor.id,
          reviewedAt: new Date(),
        },
      });
      await tx.audit.create({
        data: {
          actorId: req.actor.userId ?? req.actor.id,
          action: 'media.approve',
          targetId: id,
          detail: { role: asset.role },
        },
      });
      return { id: row.id, status: row.status };
    });
  }
  @Post('media/:id/revoke') async revoke(@Req() req: ActorRequest, @Param('id') id: string) {
    requireRole(req, ['reviewer', 'admin']);
    await this.db.$transaction(async (tx) => {
      await tx.mediaAsset.update({ where: { id }, data: { revokedAt: new Date() } });
      await tx.audit.create({
        data: {
          actorId: req.actor.userId ?? req.actor.id,
          action: 'media.revoke',
          targetId: id,
          detail: {},
        },
      });
    });
    return { id, revoked: true };
  }
  @Post('scenarios') async scenario(@Req() req: ActorRequest, @Body() dto: ScenarioDto) {
    requireRole(req, ['editor', 'admin']);
    const revision = await this.db.revision.findUniqueOrThrow({ where: { id: dto.revisionId } });
    if (
      revision.status !== 'draft' ||
      (await this.db.releaseItem.count({ where: { revisionId: dto.revisionId } }))
    )
      throw new ConflictException('Chỉ sửa case trên revision nháp.');
    const data = dto.data as {
      prompt?: string;
      explanation?: string;
      options?: { label: string; correct: boolean }[];
    };
    if (
      typeof data.prompt !== 'string' ||
      typeof data.explanation !== 'string' ||
      !Array.isArray(data.options) ||
      data.options.length < 2 ||
      data.options.length > 8 ||
      data.options.filter((o) => o.correct === true).length !== 1 ||
      data.options.some((o) => typeof o.label !== 'string' || typeof o.correct !== 'boolean')
    )
      throw new BadRequestException('Case cần đề, giải thích và đúng một đáp án.');
    return this.db.$transaction(
      async (tx) => {
        const latest = await tx.revision.findUniqueOrThrow({ where: { id: dto.revisionId } });
        if (
          latest.status !== 'draft' ||
          (await tx.releaseItem.count({ where: { revisionId: dto.revisionId } }))
        )
          throw new ConflictException('Mục đã gửi duyệt hoặc đã nằm trong release; tạo nháp mới.');
        return tx.tradeScenario.create({
          data: { revisionId: dto.revisionId, tariffId: dto.tariffId, data: dto.data as never },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }
  @Post('scenarios/:id/approve') async approveScenario(
    @Req() req: ActorRequest,
    @Param('id') id: string,
  ) {
    requireRole(req, ['reviewer', 'admin']);
    const s = await this.db.tradeScenario.findUniqueOrThrow({
      where: { id },
      include: { tariff: true },
    });
    validateHs(s.data as unknown as HsData, s.tariff);
    if (!s.tariff?.source || !s.tariff.reviewedBy)
      throw new BadRequestException('Nguồn/mã HS chưa được duyệt.');
    await this.db.tradeScenario.update({
      where: { id },
      data: {
        status: 'approved',
        reviewedBy: req.actor.userId ?? req.actor.id,
        reviewedAt: new Date(),
      },
    });
    return { id, status: 'approved' };
  }
  @Post('maintenance/orphans') cleanup(@Req() req: ActorRequest) {
    requireRole(req, ['admin']);
    return this.media.cleanup(true);
  }
}
