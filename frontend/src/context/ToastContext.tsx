import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

export type ToastKind = 'tgood' | 'tinfo' | 'twarn';
interface ToastItem {
  id: number;
  title: string;
  body?: string;
  kind: ToastKind;
}

const ToastContext = createContext<((title: string, body?: string, kind?: ToastKind) => void) | undefined>(
  undefined,
);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const push = useCallback((title: string, body?: string, kind: ToastKind = 'tinfo') => {
    const id = nextId.current++;
    setItems((prev) => [...prev, { id, title, body, kind }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div id="toast-container">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <b>{t.title}</b>
            {t.body}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
