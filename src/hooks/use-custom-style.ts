import { useEffect } from 'react';

const useCustomStyle = (id: string, css: string, beforeId?: string) => {
  useEffect(() => {
    let element = document.getElementById(id) as HTMLStyleElement | null;
    if (!css) {
      element?.remove();
      return;
    }
    if (!element) {
      element = document.createElement('style');
      element.id = id;
      document.head.insertBefore(element, beforeId ? document.getElementById(beforeId) : null);
    }
    element.textContent = css;
  }, [id, css, beforeId]);

  useEffect(() => () => { document.getElementById(id)?.remove(); }, [id]);
};

export default useCustomStyle;
