import { X } from "lucide-react";
import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { moveSheetTab } from "./sheetWorkspace";

type Sheet = { id: string; partNumber: string; name: string; revision: string };

type SheetTabsProps = {
  sheets: Sheet[];
  openSheetIds: string[];
  activeSheetId: string;
  tabBarRef: RefObject<HTMLDivElement | null>;
  onActivate: (sheetId: string) => void;
  onClose: (sheetId: string) => void;
  onReorder: (sheetIds: string[]) => void;
  onExternalDrop: (sheetId: string, point: { x: number; y: number }) => void;
};

type DragState = { sheetId: string; pointerId: number; startX: number; startY: number };

export function SheetTabs({ sheets, openSheetIds, activeSheetId, tabBarRef, onActivate, onClose, onReorder, onExternalDrop }: SheetTabsProps) {
  const dragRef = useRef<DragState | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const sheetMap = new Map(sheets.map((sheet) => [sheet.id, sheet]));

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const moved = draggingId === drag.sheetId;
    setDraggingId(null);
    if (!moved) {
      onActivate(drag.sheetId);
      return;
    }

    const bar = tabBarRef.current;
    const bounds = bar?.getBoundingClientRect();
    if (bar && bounds && event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom) {
      const tabs = Array.from(bar.querySelectorAll<HTMLElement>("[role='tab']"));
      const targetIndex = tabs.findIndex((tab) => event.clientX < tab.getBoundingClientRect().left + tab.getBoundingClientRect().width / 2);
      onReorder(moveSheetTab(openSheetIds, drag.sheetId, targetIndex < 0 ? tabs.length - 1 : targetIndex));
      return;
    }
    onExternalDrop(drag.sheetId, { x: event.screenX, y: event.screenY });
  };

  return <div ref={tabBarRef} className="hd2-sheet-tabs" role="tablist" aria-label="열린 하네스 시트">
    {openSheetIds.map((sheetId) => {
      const sheet = sheetMap.get(sheetId);
      if (!sheet) return null;
      return <div
        key={sheet.id}
        role="tab"
        tabIndex={0}
        aria-selected={sheet.id === activeSheetId}
        aria-label={`${sheet.partNumber} ${sheet.name} 시트`}
        className={`hd2-sheet-tab${sheet.id === activeSheetId ? " is-active" : ""}${draggingId === sheet.id ? " is-dragging" : ""}`}
        onClick={() => onActivate(sheet.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") onActivate(sheet.id);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          dragRef.current = { sheetId: sheet.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || event.pointerId !== drag.pointerId || draggingId) return;
          if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 5) setDraggingId(drag.sheetId);
        }}
        onPointerUp={finishDrag}
        onPointerCancel={() => { dragRef.current = null; setDraggingId(null); }}
      >
        <span>HARNESS</span><strong>{sheet.partNumber}</strong><em>{sheet.name}</em><small>REV {sheet.revision}</small>
        <button type="button" aria-label={`${sheet.partNumber} 시트 닫기`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onClose(sheet.id); }}><X size={12} /></button>
      </div>;
    })}
  </div>;
}
