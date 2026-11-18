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
  @ApiProperty({ type: [MediaResponse] }) media!: MediaResponse[];
}
export class CatalogPageResponse {
  @ApiProperty() releaseId!: string;
  @ApiProperty() internal!: boolean;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty({ type: [CatalogItemResponse] }) items!: CatalogItemResponse[];
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
