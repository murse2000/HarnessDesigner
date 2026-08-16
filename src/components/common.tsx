import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import type { ViewKind } from "../domain/types";
import { translate, type Locale } from "../i18n";
import { openDetachedView } from "../windowing";

export function IconButton({ children, title, className = "", ...props }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) {
  return <button className={`icon-button ${className}`} title={title} aria-label={title} {...props}>{children}</button>;
}

export function PanelHeader({ title, icon, view, sessionId, harnessId, actions, onDetach }: { title: string; icon?: ReactNode; view?: ViewKind; sessionId?: string; harnessId?: string; actions?: ReactNode; onDetach?: () => void }) {
  return <div className="panel-header"><div className="panel-title">{icon}{title}</div><div className="panel-actions">{actions}{view && sessionId && <IconButton title={onDetach ? "플로팅 창으로 분리" : "새 창에서 열기"} onClick={() => onDetach ? onDetach() : void openDetachedView(sessionId, view, { harnessId })}><ExternalLink size={13} /></IconButton>}</div></div>;
}

export function Field({ label, children }: PropsWithChildren<{ label: string }>) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export function EmptyState({ children }: PropsWithChildren) {
  return <div className="empty-state">{children}</div>;
}

export function T({ locale, k }: { locale: Locale; k: string }) {
  return <>{translate(locale, k)}</>;
}
