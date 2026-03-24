import { createContext, useContext, useState, ReactNode } from 'react';
import Toast from '../components/Toast';

export type ToastData = {
  message: string;
  linkText?: string;
  linkTo?: string;
  linkHref?: string;
  download?: boolean;
};

const ToastContext = createContext<(toast: ToastData | null) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastData | null>(null);
  return (
    <ToastContext.Provider value={setToast}>
      {children}
      {toast && (
        <Toast
          message={toast.message}
          linkText={toast.linkText}
          linkTo={toast.linkTo}
          linkHref={toast.linkHref}
          download={toast.download}
          onDismiss={() => setToast(null)}
        />
      )}
    </ToastContext.Provider>
  );
}
