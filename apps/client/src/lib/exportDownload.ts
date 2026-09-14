export function downloadFile(data: Blob | string, filename: string, mimeType?: string): void {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType || 'text/plain' });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
