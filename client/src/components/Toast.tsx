import { useEffect } from 'react';
import { Link } from 'react-router-dom';

interface ToastProps {
  message: string;
  linkText?: string;
  linkTo?: string;
  onDismiss: () => void;
  persistent?: boolean;
}

export default function Toast({ message, linkText, linkTo, onDismiss, persistent }: ToastProps) {
  useEffect(() => {
    if (persistent) return;
    const t = setTimeout(onDismiss, 3500);
    return () => clearTimeout(t);
  }, [onDismiss, persistent]);

  return (
    <div className="fixed bottom-24 left-4 right-4 z-50 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-2xl px-4 py-3 flex items-center justify-between shadow-lg animate-fade-in">
      <span className="text-sm">{message}</span>
      {linkText && linkTo && (
        <Link to={linkTo} onClick={onDismiss} className="text-emerald-400 dark:text-emerald-600 text-sm font-medium ml-3 flex-shrink-0">
          {linkText}
        </Link>
      )}
      {persistent && (
        <button onClick={onDismiss} className="ml-3 text-gray-400 dark:text-gray-500 flex-shrink-0 text-lg leading-none">×</button>
      )}
    </div>
  );
}
