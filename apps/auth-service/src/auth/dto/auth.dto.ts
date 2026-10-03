import { IsString, MinLength, MaxLength, IsEmail, IsOptional, IsIn } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  userName: string;

  @IsString()
  @MinLength(6)
  @MaxLength(1024)
  password: string; // RSA-OAEP 加密后的 base64 密文（解密后为 6-30 位明文）

  @IsOptional()
  @IsIn([1, 2])
  role?: number;

  @IsString()
  @MinLength(6)
  @MaxLength(6)
  code: string;
}

export class ResetPasswordDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  @MaxLength(6)
  code: string;

  @IsString()
  @MinLength(6)
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  oldPassword: string;

  @IsString()
  @MinLength(6)
  password: string;
}
