import { getProject } from './api';
import { encodeDrawFormat, DRAW_FORMAT_EXTENSION } from './drawFormat';
import { downloadFile, exportAsPDF, exportAsPNG } from './export';
import { deserializeProject } from './utils';

export type ProjectExportFormat = 'png' | 'pdf' | 'dra';

/** Loads and exports one persisted project through the canonical renderers. */
export async function exportPersistedProject(input: {
  projectId: string;
  title: string;
  token: string | null;
  format: ProjectExportFormat;
}): Promise<void> {
  const record = await getProject(input.projectId, input.token);
  const filename = input.title || 'drawing';

  if (input.format === 'dra') {
    const encoded = await encodeDrawFormat(record.data);
    downloadFile(
      new Blob([encoded], { type: 'application/x-drawapp' }),
      `${filename}${DRAW_FORMAT_EXTENSION}`,
    );
    return;
  }

  const objects = deserializeProject(record.data);
  if (input.format === 'pdf') {
    downloadFile(await exportAsPDF(objects, { title: filename }), `${filename}.pdf`);
    return;
  }

  downloadFile(await exportAsPNG(objects), `${filename}.png`);
}
