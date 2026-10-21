import { useEffect, useState } from 'react';

// Includes the scroll arrows and new-tab button, leaving room to select tabs.
const MIN_TAB_BAR_WIDTH = 200;

const useHeaderSpace = () => {
  const [container, containerRef] = useState<HTMLDivElement | null>(null);
  const [header, headerRef] = useState<HTMLDivElement | null>(null);
  const [hasHeaderSpace, setHasHeaderSpace] = useState(false);

  useEffect(() => {
    if (!container || !header) return;

    const controls = Array.from(header.children);
    const measure = () => {
      // Use intrinsic child widths in both layouts to avoid a merge/unmerge loop.
      // Two rem reserve padding, the divider and gap in either header layout.
      const chromeWidth = 2 * parseFloat(getComputedStyle(document.documentElement).fontSize);
      const headerWidth = controls.reduce((width, child) => width + child.getBoundingClientRect().width, chromeWidth);
      setHasHeaderSpace(container.clientWidth >= Math.ceil(headerWidth) + MIN_TAB_BAR_WIDTH);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    controls.forEach((control) => observer.observe(control));
    measure();
    return () => observer.disconnect();
  }, [container, header]);

  return { containerRef, headerRef, hasHeaderSpace: !!container && !!header && hasHeaderSpace };
};

export default useHeaderSpace;
