import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsIn,
  MinLength,
  MaxLength
} from 'class-validator';
import { IsAfterNow } from './validators/is-after-now';

export class CreateLiveDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsNumber()
  @IsOptional()
  type?: number;

  @IsString()
  @IsNotEmpty()
  @IsAfterNow({ message: '开始时间不能早于当前时间' })
  startTime: string;

  @IsNumber()
  @IsOptional()
  duration?: number;

  @IsString()
  @IsOptional()
  roomId?: string;
}

export class JoinLiveDto {
  @IsString()
  @IsNotEmpty()
  joinCode: string;

  @IsString()
  @IsOptional()
  nickName?: string;
}

export class ChangeStatusDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;

  @IsNumber()
  status: number;
}

export class UpdateForbidDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;

  /** 操作者 liveUserId，网关不消费，仅保持与前端契约一致 */
  @IsString()
  @IsOptional()
  liveUserId?: string;

  /** 0=禁言，1=可发言 */
  @IsNumber()
  @IsIn([0, 1])
  status: number;
}

export class UpdateLiveDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;

  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsNumber()
  @IsOptional()
  type?: number;

  @IsString()
  @IsOptional()
  startTime?: string;

  @IsNumber()
  @IsOptional()
  duration?: number;
}

export class CreateCoursewareDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  filename: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  filext?: string;

  @IsNumber()
  @IsOptional()
  filesize?: number;

  @IsString()
  @IsNotEmpty()
  fileUrl: string;
}
