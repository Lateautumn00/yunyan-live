import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsIn,
  IsBoolean,
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

export class StartCheckinDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;

  /** 签到窗口秒数（30/60/120，默认 60 由前端约定） */
  @IsNumber()
  @IsIn([30, 60, 120])
  duration: number;
}

export class RespondCheckinDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;

  @IsString()
  @IsNotEmpty()
  sessionId: string;

  /** true=补签（窗口已关闭且教师已开启补签时生效） */
  @IsBoolean()
  @IsOptional()
  makeup?: boolean;
}

export class CheckinSessionActionDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;

  @IsString()
  @IsNotEmpty()
  sessionId: string;
}
