import { IsIn, IsInt, IsString, Length, Max, Min } from 'class-validator';
import {
  ALLOWED_ASSET_MIME_TYPES,
  MAX_ASSET_DIMENSION,
} from '../assets.constants';

export class CreateAssetUploadDto {
  @IsString()
  @Length(1, 255)
  fileName: string;

  @IsIn(ALLOWED_ASSET_MIME_TYPES)
  mimeType: string;

  @IsInt()
  @Min(1)
  size: number;

  @IsInt()
  @Min(1)
  @Max(MAX_ASSET_DIMENSION)
  width: number;

  @IsInt()
  @Min(1)
  @Max(MAX_ASSET_DIMENSION)
  height: number;
}
