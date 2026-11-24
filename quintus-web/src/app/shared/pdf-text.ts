/**
 * Texte d'un PDF, colonnes séparées par des tabulations. pdf.js n'est chargé qu'au premier import ;
 * son « worker » est copié dans le build par angular.json (assets → pdfjs/).
 * Un PDF scanné ne contient pas de texte : la fonction renvoie alors une chaîne vide.
 */
import { itemsToText } from '../domain';

export async function readPdfText(file: Blob): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs/pdf.worker.min.mjs', document.baseURI).href;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await task.promise;
  const pages: string[] = [];
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const content = await (await pdf.getPage(i)).getTextContent();
      const items = content.items.flatMap((it) =>
        'str' in it
          ? [
              {
                str: it.str,
                x: it.transform[4],
                y: it.transform[5],
                w: it.width,
                h: it.height || Math.abs(it.transform[3]),
              },
            ]
          : [],
      );
      pages.push(itemsToText(items));
    }
  } finally {
    await task.destroy();
  }
  return pages.join('\n').trim();
}
