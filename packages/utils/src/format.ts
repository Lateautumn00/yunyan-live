export function formatDate(time: number, format = 'YYYY-MM-DD HH:mm:ss'): string {
  if (!time) {
    return '';
  }
  const timeStamp = new Date(time);

  let res = '';
  if (format === 'YYYY-MM-DD HH:mm:ss') {
    const year = timeStamp.getFullYear();
    const month = formateNumber(timeStamp.getMonth() + 1);
    const date = formateNumber(timeStamp.getDate());
    const hour = formateNumber(timeStamp.getHours());
    const minute = formateNumber(timeStamp.getMinutes());
    const second = formateNumber(timeStamp.getSeconds());
    res = `${year}-${month}-${date} ${hour}:${minute}:${second}`;
  }
  return res;
}

export function formateNumber(num: number): string {
  const str = num.toString();
  return str[1] ? str : `0${str}`;
}
