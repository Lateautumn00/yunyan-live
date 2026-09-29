import { IsString, IsNotEmpty, IsNumber, IsOptional, MinLength, MaxLength, ValidatorConstraint, ValidatorConstraintInterface, registerDecorator, ValidationOptions } from 'class-validator';

@ValidatorConstraint({ name: 'IsAfterNow', async: false })
class IsAfterNowValidator implements ValidatorConstraintInterface {
  validate(value: string) {
    if (!value) return true;
    return Number(value) > Date.now();
  }
  defaultMessage() {
    return '开始时间不能早于当前时间';
  }
}

function IsAfterNow(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'IsAfterNow',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsAfterNowValidator,
    });
  };
}

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
