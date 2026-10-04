import type { FormItemRule } from 'element-plus';

export function emailRules(): FormItemRule[] {
  return [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' }
  ];
}

export function passwordRules(requiredMessage = '请输入密码'): FormItemRule[] {
  return [
    { required: true, message: requiredMessage, trigger: 'blur' },
    { min: 6, message: '密码至少6位', trigger: 'blur' }
  ];
}

export function passwordConfirmRules(getPassword: () => string): FormItemRule[] {
  return [
    { required: true, message: '请确认密码', trigger: 'blur' },
    {
      validator: (_rule: unknown, value: string, callback: (error?: Error) => void) => {
        if (value !== getPassword()) {
          callback(new Error('两次输入密码不一致'));
        } else {
          callback();
        }
      },
      trigger: 'blur'
    }
  ];
}
