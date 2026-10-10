import { cloneElement, useEffect, useRef, useState, type ReactElement } from 'react';
import { motion } from '../../shared/motion';

type Child = ReactElement<{ className?: string }>;

/**
 * Lets a panel leave with an animation. When `show` turns false the child stays on screen for
 * `ms`, marked `is-leaving` so the stylesheet can squish it out, and only then unmounts.
 * The child is a function so nothing is built from data that no longer exists while hidden.
 */
export function Presence({ show, ms = motion.squishOut.ms, children }: { show: boolean; ms?: number; children: () => Child }) {
  const [mounted, setMounted] = useState(show);
  const last = useRef<Child | null>(null);
  if (show) last.current = children();

  useEffect(() => {
    if (show) return setMounted(true);
    const timer = window.setTimeout(() => setMounted(false), ms);
    return () => window.clearTimeout(timer);
  }, [show, ms]);

  const child = last.current;
  if (!child || (!show && !mounted)) return null;
  return show ? child : cloneElement(child, { className: `${child.props.className ?? ''} is-leaving` });
}
