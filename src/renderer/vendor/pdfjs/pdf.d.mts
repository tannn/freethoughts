export const GlobalWorkerOptions: {
  workerSrc: string;
};

export function getDocument(params: { url: string }): {
  promise: Promise<unknown>;
  destroy?: () => void;
};

export class TextLayer {
  constructor(params: {
    textContentSource: unknown;
    container: HTMLElement;
    viewport: unknown;
    textDivs?: HTMLElement[];
  });
  render(): Promise<unknown>;
}
