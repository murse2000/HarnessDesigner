import { useEffect, useRef, type ReactNode } from "react";

export interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
  action: () => void;
}

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: ContextMenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: Event) => { if (!ref.current?.contains(event.target as globalThis.Node)) onClose(); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("mousedown", close);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);
  const left = Math.max(4, Math.min(x, window.innerWidth - 224));
  const top = Math.max(4, Math.min(y, window.innerHeight - items.length * 29 - 12));
  return <div ref={ref} className="context-menu" style={{ left, top }} role="menu" onContextMenu={(event) => event.preventDefault()}>
    {items.map((item, index) => <button key={`${item.label}-${index}`} role="menuitem" className={`${item.danger ? "is-danger" : ""}${item.separatorBefore ? " has-separator" : ""}`} disabled={item.disabled} onClick={() => { item.action(); onClose(); }}>
      <span>{item.icon}</span><strong>{item.label}</strong>{item.shortcut && <kbd>{item.shortcut}</kbd>}
    </button>)}
  </div>;
}
