// Compare the actual displayed caption content, including author and order.
import type { Caption } from './view.ts';
export function sameCaptions(a: readonly Caption[], b: readonly Caption[]): boolean {
  return a.length === b.length && a.every((caption, index) => caption.by === b[index].by && caption.text === b[index].text);
}
export function captionUpdater(render: (captions: readonly Caption[]) => void): (captions: readonly Caption[]) => void {
  let displayed: Caption[] = [];
  return (captions) => {
    if (sameCaptions(displayed, captions)) return;
    render(captions);
    displayed = captions.map((caption) => ({ ...caption }));
  };
}
