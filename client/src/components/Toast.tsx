import { useEffect } from 'react';
import { Link } from 'react-router-dom';

interface ToastProps {
  message: string;
  linkText?: string;
  linkTo?: string;
  onDismiss: () => void;
}

export default function Toast({ message, linkText, linkTo, onDismiss }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3500);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-24 left-4 right-4 z-50 bg-gray-900 text-white rounded-2xl px-4 py-3 flex items-center justify-between shadow-lg animate-fade-in">
      <span className="text-sm">{message}</span>
      {linkText && linkTo && (
        <Link to={linkTo} onClick={onDismiss} className="text-emerald-400 text-sm font-medium ml-3 flex-shrink-0">
          {linkText}
        </Link>
      )}
    </div>
  );
}
