import { ApiProperty } from '@nestjs/swagger';
export class NameResponse {
  @ApiProperty() kind!: string;
  @ApiProperty() label!: string;
  @ApiProperty() source!: string;
  @ApiProperty({ nullable: true }) pronunciation!: string | null;
}
export class MediaResponse {
  @ApiProperty() id!: string;
  @ApiProperty() role!: string;
  @ApiProperty({ nullable: true }) nameKind!: string | null;
  @ApiProperty() approved!: boolean;
}
export class CatalogItemResponse {
  @ApiProperty() revisionId!: string;
  @ApiProperty() externalId!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() group!: string;
  @ApiProperty({ type: [NameResponse] }) names!: NameResponse[];
  @ApiProperty({ type: [String] }) forms!: string[];
  @ApiProperty() identification!: string;
  @ApiProperty() note!: string;
  @ApiProperty({ required: false, nullable: true, type: String }) taxonomicGroup!: string | null;
  @ApiProperty({ required: false, nullable: true, type: String }) family!: string | null;
  @ApiProperty({ required: false, nullable: true, type: String }) familyVi!: string | null;
  @ApiProperty({ required: false, type: [String] }) enAliases!: string[];
  @ApiProperty({ required: false, nullable: true, type: String }) jaKanji!: string | null;
  @ApiProperty({ required: false, nullable: true, type: String }) jaTrade!: string | null;
  @ApiProperty({ type: [MediaResponse] }) media!: MediaResponse[];
}
export class OverviewGroupsResponse {
  @ApiProperty() fish!: number;
  @ApiProperty() crustacean!: number;
  @ApiProperty() mollusc!: number;
  @ApiProperty() other!: number;
  @ApiProperty() none!: number;
}
export class CatalogPageResponse {
  @ApiProperty() releaseId!: string;
  @ApiProperty() internal!: boolean;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty({ type: [CatalogItemResponse] }) items!: CatalogItemResponse[];
  @ApiProperty({
    type: OverviewGroupsResponse,
    description:
      'Items per taxonomic group for the current q/learnable/group filters, ignoring taxon.',
  })
  groups!: OverviewGroupsResponse;
}
export class OverviewItemResponse {
  @ApiProperty() revisionId!: string;
  @ApiProperty() itemId!: string;
  @ApiProperty() vi!: string;
  @ApiProperty() scientific!: string;
  @ApiProperty({ nullable: true, type: String }) taxonomicGroup!: string | null;
  @ApiProperty({ nullable: true, type: String }) imageId!: string | null;
}
export class CatalogOverviewResponse {
  @ApiProperty() releaseId!: string;
  @ApiProperty() internal!: boolean;
  @ApiProperty() learnable!: number;
  @ApiProperty({ type: OverviewGroupsResponse }) groups!: OverviewGroupsResponse;
  @ApiProperty() hsCases!: number;
  @ApiProperty({ type: [OverviewItemResponse] }) items!: OverviewItemResponse[];
}
export class SignedUrlResponse {
  @ApiProperty() url!: string;
  @ApiProperty() expiresIn!: number;
}
export class OptionResponse {
  @ApiProperty() id!: string;
  @ApiProperty() label!: string;
}
export class ScoreResponse {
  @ApiProperty() answered!: boolean;
  @ApiProperty() skipped!: boolean;
  @ApiProperty() correct!: boolean;
  @ApiProperty() selfRated!: boolean;
  @ApiProperty() questionId!: string;
  @ApiProperty() targetId!: string;
  @ApiProperty() skill!: string;
  @ApiProperty() contentVersion!: string;
  @ApiProperty() at!: string;
  @ApiProperty() explanation!: string;
  @ApiProperty({ required: false }) source?: string;
  @ApiProperty({ required: false }) correctOption?: string;
  @ApiProperty({ required: false, type: Object }) correctPairs?: Record<string, string>;
  @ApiProperty({
    required: false,
    type: () => [ReviewProgressResponse],
    description: 'Account students only: review rows this answer touched, read after the write.',
  })
  progress?: ReviewProgressResponse[];
}
export class ReviewProgressResponse {
  @ApiProperty() targetId!: string;
  @ApiProperty() skill!: string;
  @ApiProperty() stage!: number;
  @ApiProperty({ description: 'Effective next due date (ISO).' }) dueAt!: string;
  @ApiProperty({ enum: [0, 1, 2, 3, 4] }) level!: 0 | 1 | 2 | 3 | 4;
}
export class SessionSummaryEntryResponse {
  @ApiProperty() targetId!: string;
  @ApiProperty() label!: string;
  @ApiProperty() correct!: boolean;
  @ApiProperty() skipped!: boolean;
  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Null for invite-code sessions, skipped entries and items without a schedule.',
  })
  nextReviewInDays!: number | null;
}
export class SessionSummaryResponse {
  @ApiProperty({ description: 'Graded entries (a matching question counts once per pair).' })
  total!: number;
  @ApiProperty({ description: 'Entries answered correctly (not skipped).' }) caught!: number;
  @ApiProperty({ type: [SessionSummaryEntryResponse] }) entries!: SessionSummaryEntryResponse[];
}
export class QuestionResponse {
  @ApiProperty() id!: string;
  @ApiProperty() type!: string;
  @ApiProperty() prompt!: string;
  @ApiProperty({ required: false }) front?: string;
  @ApiProperty({ type: [OptionResponse], required: false }) options?: OptionResponse[];
  @ApiProperty({ type: [OptionResponse], required: false }) left?: OptionResponse[];
  @ApiProperty({ type: [OptionResponse], required: false }) right?: OptionResponse[];
  @ApiProperty({ type: [OptionResponse], required: false }) followUps?: OptionResponse[];
  @ApiProperty({ required: false }) catalog?: string;
  @ApiProperty({ type: SignedUrlResponse, required: false }) image?: SignedUrlResponse;
  @ApiProperty({ type: SignedUrlResponse, required: false }) audio?: SignedUrlResponse;
  @ApiProperty() unavailable!: boolean;
  @ApiProperty({
    type: ScoreResponse,
    required: false,
    description: 'Present only after this question was submitted.',
  })
  result?: ScoreResponse;
}
export class GameResponse {
  @ApiProperty() id!: string;
  @ApiProperty() releaseId!: string;
  @ApiProperty() mode!: string;
  @ApiProperty() internal!: boolean;
  @ApiProperty() expiresAt!: string;
  @ApiProperty({ type: [QuestionResponse] }) questions!: QuestionResponse[];
}
export class RevealResponse {
  @ApiProperty({ type: SignedUrlResponse, required: false, nullable: true })
  audio?: SignedUrlResponse | null;
  @ApiProperty() label!: string;
  @ApiProperty({ nullable: true }) pronunciation!: string | null;
  @ApiProperty() source!: string;
  @ApiProperty({ nullable: true }) audioAssetId!: string | null;
}
export class AuthMeResponse {
  @ApiProperty() role!: string;
  @ApiProperty() internal!: boolean;
  @ApiProperty() csrf!: string;
  @ApiProperty() expiresAt!: string;
  @ApiProperty({ required: false, description: 'Account sessions only.' }) userId?: string;
  @ApiProperty({
    required: false,
    nullable: true,
    type: String,
    description: 'Account sessions only.',
  })
  displayName?: string | null;
  @ApiProperty({ required: false, description: 'Account sessions only.' })
  mustChangePassword?: boolean;
}
export class MeResponse {
  @ApiProperty() username!: string;
  @ApiProperty({ nullable: true, type: String }) displayName!: string | null;
  @ApiProperty() role!: string;
  @ApiProperty() mustChangePassword!: boolean;
}
/** The rotated session after a password change (same fields as /auth/me) plus `changed`. */
export class PasswordChangedResponse extends AuthMeResponse {
  @ApiProperty() changed!: boolean;
}
export class CreatedUserResponse {
  @ApiProperty() id!: string;
  @ApiProperty() username!: string;
  @ApiProperty() role!: string;
  @ApiProperty({ nullable: true, type: String }) displayName!: string | null;
  @ApiProperty() mustChangePassword!: boolean;
}
export class CastTargetResponse {
  @ApiProperty() targetId!: string;
  @ApiProperty() skill!: string;
}
export class CastPlanResponse {
  @ApiProperty({ enum: ['review', 'flashcard', 'done'] }) kind!: 'review' | 'flashcard' | 'done';
  @ApiProperty({ required: false, type: [CastTargetResponse], description: 'kind = review.' })
  targets?: CastTargetResponse[];
  @ApiProperty({ required: false, description: 'kind = flashcard.' }) revisionId?: string;
}
export class SkillProgressResponse {
  @ApiProperty({ enum: ['en', 'ja', 'scientific', 'hs'] }) key!: 'en' | 'ja' | 'scientific' | 'hs';
  @ApiProperty() label!: string;
  @ApiProperty() done!: number;
  @ApiProperty() total!: number;
}
export class MeHomeResponse {
  @ApiProperty() releaseId!: string;
  @ApiProperty() internal!: boolean;
  @ApiProperty() learnable!: number;
  @ApiProperty({ type: [OverviewItemResponse] }) haul!: OverviewItemResponse[];
  @ApiProperty({ type: CastPlanResponse }) cast!: CastPlanResponse;
  @ApiProperty({ description: 'Active review rows whose effective due date is now or earlier.' })
  due!: number;
  @ApiProperty({ type: [SkillProgressResponse] }) skills!: SkillProgressResponse[];
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Latest unexpired session of this login that still has unanswered questions.',
  })
  activeSessionId!: string | null;
}
export class ReviewEntryResponse {
  @ApiProperty() targetId!: string;
  @ApiProperty({ nullable: true, type: String, description: 'Null for HS cases.' })
  itemId!: string | null;
  @ApiProperty() label!: string;
  @ApiProperty() skill!: string;
  @ApiProperty() stage!: number;
  @ApiProperty({ description: 'Effective due date (ISO).' }) dueAt!: string;
}
export class MeReviewResponse {
  @ApiProperty({ type: [ReviewEntryResponse], description: 'Due now, earliest first.' })
  due!: ReviewEntryResponse[];
  @ApiProperty({ type: [ReviewEntryResponse], description: 'Due later, earliest first.' })
  scheduled!: ReviewEntryResponse[];
}
export class MasteryCountsResponse {
  @ApiProperty() unlearned!: number;
  @ApiProperty() level1!: number;
  @ApiProperty() level2!: number;
  @ApiProperty() level3!: number;
  @ApiProperty() level4!: number;
}
export class SessionHistoryResponse {
  @ApiProperty() sessionId!: string;
  @ApiProperty() at!: string;
  @ApiProperty() mode!: string;
  @ApiProperty() answered!: number;
  @ApiProperty() firstTry!: number;
  @ApiProperty() selfRated!: number;
  @ApiProperty({ nullable: true, type: Number }) percent!: number | null;
}
export class StreakResponse {
  @ApiProperty() current!: number;
  @ApiProperty() longest!: number;
}
export class BadgeResponse {
  @ApiProperty() id!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ nullable: true, type: String }) earnedAt!: string | null;
}
export class AchievementsResponse {
  @ApiProperty({ type: StreakResponse }) streak!: StreakResponse;
  @ApiProperty({ type: [BadgeResponse] }) badges!: BadgeResponse[];
}
export class FiguresResponse {
  @ApiProperty() answered!: number;
  @ApiProperty({ nullable: true, type: Number }) firstTryPercent!: number | null;
  @ApiProperty() selfRated!: number;
}
export class MeProgressResponse {
  @ApiProperty({ type: [SkillProgressResponse] }) skills!: SkillProgressResponse[];
  @ApiProperty({ type: MasteryCountsResponse }) mastery!: MasteryCountsResponse;
  @ApiProperty({ type: [SessionHistoryResponse], description: 'Latest five, newest first.' })
  sessions!: SessionHistoryResponse[];
  @ApiProperty({ type: AchievementsResponse }) achievements!: AchievementsResponse;
  @ApiProperty({ type: FiguresResponse }) figures!: FiguresResponse;
}
export class MeMasteryEntryResponse {
  @ApiProperty({ enum: ['new', 'due', 'learning'] }) status!: 'new' | 'due' | 'learning';
  @ApiProperty({ enum: [0, 1, 2, 3, 4] }) level!: 0 | 1 | 2 | 3 | 4;
}
export class AdminUserRowResponse {
  @ApiProperty() id!: string;
  @ApiProperty() username!: string;
  @ApiProperty({ nullable: true, type: String }) displayName!: string | null;
  @ApiProperty() role!: string;
  @ApiProperty() disabled!: boolean;
  @ApiProperty() mustChangePassword!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ nullable: true, type: String }) lastLoginAt!: string | null;
}
export class AdminUserPageResponse {
  @ApiProperty({ type: [AdminUserRowResponse] }) items!: AdminUserRowResponse[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
export class TemporaryPasswordResponse {
  @ApiProperty({ description: 'Shown once; never stored or logged in clear.' })
  temporaryPassword!: string;
}
export class DeletedUserResponse {
  @ApiProperty() deleted!: boolean;
}
