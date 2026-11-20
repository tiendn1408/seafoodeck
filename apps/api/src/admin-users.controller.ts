import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AccessGuard, ActorRequest, AdminOnlyGuard, requireRole } from './security';
import {
  AdminUserPageResponse,
  AdminUserRowResponse,
  BulkCreateUsersResponse,
  DeletedUserResponse,
  TemporaryPasswordResponse,
} from './contract';
import { USER_ROLES } from './admin-extra.controller';
import { UsersService } from './users.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Roles an admin can filter by: every creatable role plus `admin` (which exists but is not creatable). */
export const LISTABLE_ROLES = [...USER_ROLES, 'admin'];
export class ListUsersQuery {
  @ApiProperty({ required: false, enum: LISTABLE_ROLES })
  @IsOptional()
  @IsIn(LISTABLE_ROLES)
  role?: string;
  @ApiProperty({ required: false, enum: ['active', 'disabled'] })
  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: 'active' | 'disabled';
  @ApiProperty({
    required: false,
    maxLength: 80,
    description: 'Matches username or display name, ignoring case.',
  })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
  @ApiProperty({ required: false, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
  @ApiProperty({ required: false, default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
/** Only these two fields: role changes are deliberately not part of PATCH. */
export class UpdateUserDto {
  @ApiProperty({ required: false, nullable: true, type: String, maxLength: 80 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string | null;
  @ApiProperty({
    required: false,
    description: 'true locks the account and revokes its sessions; false unlocks it.',
  })
  @IsOptional()
  @IsBoolean()
  disabled?: boolean;
}
export class DeleteUserDto {
  @ApiProperty({ description: "Must equal the user's username (case-insensitive)." })
  @IsString()
  @MaxLength(80)
  confirmUsername!: string;
}
/** One CSV line. Lengths are capped here; the username pattern is judged per row by the service. */
export class BulkUserRowDto {
  @ApiProperty({ maxLength: 50, description: 'Pattern ^[a-zA-Z0-9_-]{3,50}$, checked per row.' })
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  username!: string;
  @ApiProperty({ required: false, nullable: true, type: String, maxLength: 80 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string | null;
  @ApiProperty({
    required: false,
    nullable: true,
    type: String,
    maxLength: 150,
    description: 'At least 8 characters. Blank: the server generates one and forces a change.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  password?: string | null;
}
export class BulkCreateUsersDto {
  @ApiProperty({ type: [BulkUserRowDto], minItems: 1, maxItems: 500 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BulkUserRowDto)
  rows!: BulkUserRowDto[];
  @ApiProperty({
    required: false,
    default: false,
    description: 'Only check format and duplicates: nothing is created and no password returned.',
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

@ApiTags('Admin')
@Controller('admin')
@UseGuards(AccessGuard, AdminOnlyGuard)
export class AdminUsersController {
  constructor(private users: UsersService) {}
  @ApiOkResponse({ type: AdminUserPageResponse })
  @Get('users')
  list(@Req() req: ActorRequest, @Query() query: ListUsersQuery) {
    requireRole(req, ['admin']);
    return this.users.list(query);
  }
  @ApiCreatedResponse({ type: BulkCreateUsersResponse })
  @Post('users/bulk')
  bulkCreate(@Req() req: ActorRequest, @Body() dto: BulkCreateUsersDto) {
    requireRole(req, ['admin']);
    return this.users.bulkCreate(req.actor.userId!, dto.rows, dto.dryRun ?? false);
  }
  @ApiOkResponse({ type: AdminUserRowResponse })
  @Patch('users/:id')
  update(@Req() req: ActorRequest, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    requireRole(req, ['admin']);
    return this.users.update(req.actor.userId!, id, dto);
  }
  @ApiCreatedResponse({ type: TemporaryPasswordResponse })
  @Post('users/:id/reset-password')
  resetPassword(@Req() req: ActorRequest, @Param('id') id: string) {
    requireRole(req, ['admin']);
    return this.users.resetPassword(req.actor.userId!, id);
  }
  @ApiOkResponse({ type: DeletedUserResponse })
  @Delete('users/:id')
  remove(@Req() req: ActorRequest, @Param('id') id: string, @Body() dto: DeleteUserDto) {
    requireRole(req, ['admin']);
    return this.users.remove(req.actor.userId!, id, dto.confirmUsername);
  }
}
