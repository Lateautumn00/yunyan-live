async function copyViaTextarea(text: string): Promise<boolean> {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}

export async function copyText(text: string): Promise<boolean> {
  const api = window.electronAPI;
  if (api?.clipboardWriteText) {
    await api.clipboardWriteText(text);
    return true;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyViaTextarea(text);
  }
}

export async function saveBinaryFile(
  buffer: ArrayBuffer,
  defaultName: string
): Promise<boolean> {
  const api = window.electronAPI;
  if (api?.recordingSaveBlob) {
    const result = await api.recordingSaveBlob({ buffer, defaultName });
    return result?.success !== false;
  }
  try {
    const url = URL.createObjectURL(new Blob([buffer]));
    const link = document.createElement('a');
    link.href = url;
    link.download = defaultName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  } catch {
    return false;
  }
}
