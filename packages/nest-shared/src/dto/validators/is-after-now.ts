import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface
} from 'class-validator';

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

/** 校验时间字符串晚于当前时间（直播开始时间用） */
export function IsAfterNow(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'IsAfterNow',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsAfterNowValidator
    });
  };
}
