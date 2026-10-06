interface RegexpRules {
  passWord: RegExp;
  phone: RegExp;
  email: RegExp;
  commonName: RegExp;
  liveName: RegExp;
  password: RegExp;
}

export const regexp: RegexpRules = {
  passWord: /^[a-zA-Z0-9]{6,16}$/,
  phone: /^1[3,4,5,6,7,8,9][\d]{9}$/,
  email: /^([a-zA-Z0-9]+[_.]?)*[a-zA-Z0-9]+@([a-zA-Z0-9]+[_.]?)*[a-zA-Z0-9]+.[a-zA-Z]{2,3}$/,
  commonName: /^[\u4E00-\u9FA5a-zA-Z\d_]{2,15}$/,
  liveName: /^[\u4E00-\u9FA5a-zA-Z\d_]{1,49}$/,
  password:
    /^(?![a-zA-Z]+$)(?![A-Z0-9]+$)(?![A-Z\W_^()`~!@#$%^&*\-+=|{}[\]:;'<>,.?/]+$)(?![a-z0-9]+$)(?![a-z\W_^()`~!@#$%^&*\-+=|{}[\]:;'<>,.?/]+$)(?![0-9\W_^()`~!@#$%^&*\-+=|{}[\]:;'<>,.?/]+$)[a-zA-Z0-9\W_^()`~!@#$%^&*\-+=|{}[\]:;'<>,.?/]{8,30}$/
};

export function isVoid(checkedmsg: string): boolean {
  return !checkedmsg;
}

export function isCheckedLength(checkedmsg: string, minLength: number, maxLength: number): boolean {
  const checkedmsgLength = checkedmsg.length;
  return checkedmsgLength >= minLength && checkedmsgLength <= maxLength;
}

export function isCheckedAllRules(checkedmsg: string, type: keyof RegexpRules): boolean {
  return regexp[type].test(checkedmsg);
}
