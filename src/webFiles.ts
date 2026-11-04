/** Web-only helpers for backing up and restoring tasks (browser storage can be cleared, a file can't). */

export async function saveBackup(json: string): Promise<string> {
  const d = new Date();
  const name = `paced-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
  const file = new File([json], name, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  // iPhone: the share sheet lets you "Save to Files" or send it to yourself.
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'Paced backup' });
      return 'Backup ready. Save it to Files.';
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'Backup cancelled.';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return `Downloaded ${name}.`;
}

export function pickBackupFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      f.text().then(resolve, () => resolve(null));
    };
    input.click();
  });
}
