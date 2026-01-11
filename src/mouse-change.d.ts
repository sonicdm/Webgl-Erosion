declare module 'mouse-change' {
  const mouseChange: (
    element: HTMLElement,
    callback: (buttons: number, x: number, y: number) => void
  ) => void;
  export = mouseChange;
}

