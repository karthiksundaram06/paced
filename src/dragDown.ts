/**
 * A downward finger drag, for "pull down to sync" and "swipe down to close" on the iPhone (web only).
 *
 * The decision is made on the first finger movement: Safari only lets a page cancel its own
 * scrolling on that first move, so a drag that starts as a scroll stays a scroll.
 */
export interface DragDownHandlers {
  /** Whether a drag may start from this touch (e.g. only when the list is scrolled to the top). */
  canStart: (target: EventTarget | null) => boolean;
  /** Finger distance in px below where it started (never negative). */
  onMove: (dy: number) => void;
  /** Finger lifted. velocity in px per ms, positive = moving down. */
  onEnd: (dy: number, velocity: number) => void;
}

type Phase = 'idle' | 'maybe' | 'drag' | 'off';

export function attachDragDown(node: HTMLElement, h: DragDownHandlers): () => void {
  let phase: Phase = 'idle';
  let x0 = 0;
  let y0 = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;

  const start = (e: TouchEvent) => {
    if (e.touches.length !== 1) {
      phase = 'off';
      return;
    }
    const p = e.touches[0];
    x0 = p.clientX;
    y0 = lastY = p.clientY;
    lastT = e.timeStamp;
    velocity = 0;
    phase = h.canStart(e.target) ? 'maybe' : 'off';
  };

  const move = (e: TouchEvent) => {
    if (phase !== 'maybe' && phase !== 'drag') return;
    if (e.touches.length !== 1) {
      finish();
      return;
    }
    const p = e.touches[0];
    const dy = p.clientY - y0;
    const dx = p.clientX - x0;
    if (phase === 'maybe') {
      if (dy === 0 && dx === 0) return;
      // Up or sideways: an ordinary scroll, leave it to Safari.
      if (dy < 0 || Math.abs(dx) > dy) {
        phase = 'off';
        return;
      }
      phase = 'drag';
    }
    if (e.cancelable) e.preventDefault(); // no rubber-band bounce or page reload while dragging
    const dt = e.timeStamp - lastT;
    if (dt > 0) velocity = (p.clientY - lastY) / dt;
    lastY = p.clientY;
    lastT = e.timeStamp;
    h.onMove(Math.max(0, dy));
  };

  const finish = () => {
    if (phase === 'drag') h.onEnd(Math.max(0, lastY - y0), velocity);
    phase = 'idle';
  };

  node.addEventListener('touchstart', start, { passive: true });
  node.addEventListener('touchmove', move, { passive: false });
  node.addEventListener('touchend', finish);
  node.addEventListener('touchcancel', finish);
  return () => {
    node.removeEventListener('touchstart', start);
    node.removeEventListener('touchmove', move);
    node.removeEventListener('touchend', finish);
    node.removeEventListener('touchcancel', finish);
  };
}

/** The DOM node behind a react-native-web ref (ScrollView refs expose getScrollableNode). */
export function domNode(ref: unknown): HTMLElement | null {
  if (!ref) return null;
  const r = ref as { getScrollableNode?: () => HTMLElement };
  if (typeof r.getScrollableNode === 'function') return r.getScrollableNode();
  return typeof HTMLElement !== 'undefined' && ref instanceof HTMLElement ? ref : null;
}
