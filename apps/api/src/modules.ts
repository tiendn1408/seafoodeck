import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Db } from './db';
import {
  Auth,
  AccessGuard,
  AdminOnlyGuard,
  EditingGuard,
  LoginLimiter,
  MustChangePasswordGuard,
} from './security';
import { AuthController } from './auth.controller';
import { MeController } from './me.controller';
import { Catalog } from './catalog';
import { Media } from './media';
import { Learning } from './learning';
import { ProgressService } from './progress.service';
import {
  CatalogController,
  MediaController,
  LearningController,
  AdminController,
} from './controllers';
import { AdminExtraController } from './admin-extra.controller';
@Global()
@Module({ providers: [Db], exports: [Db] })
export class DatabaseModule {}
@Module({
  imports: [DatabaseModule],
  controllers: [AuthController, MeController],
  providers: [
    Auth,
    AccessGuard,
    AdminOnlyGuard,
    EditingGuard,
    LoginLimiter,
    // Global: runs before every controller's own guards and resolves the session cookie itself.
    { provide: APP_GUARD, useClass: MustChangePasswordGuard },
  ],
  exports: [Auth, AccessGuard, AdminOnlyGuard, EditingGuard],
})
export class AuthModule {}
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [CatalogController],
  providers: [Catalog],
  exports: [Catalog],
})
export class CatalogModule {}
@Module({
  imports: [DatabaseModule, AuthModule, CatalogModule],
  controllers: [MediaController],
  providers: [Media],
  exports: [Media],
})
export class MediaModule {}
@Module({
  imports: [DatabaseModule, AuthModule, CatalogModule, MediaModule],
  controllers: [LearningController],
  providers: [Learning, ProgressService],
  exports: [ProgressService],
})
export class LearningModule {}
@Module({
  imports: [DatabaseModule, AuthModule, CatalogModule, MediaModule],
  controllers: [AdminController, AdminExtraController],
})
export class AdminModule {}
