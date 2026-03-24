import { useEffect } from 'react';
import { Link } from 'react-router-dom';

interface ToastProps {
  message: string;
  linkText?: string;
  linkTo?: string;
  linkHref?: string;   // use instead of linkTo for <a download> links
  download?: boolean;
  onDismiss: () => void;
}

export default function Toast({ message, linkText, linkTo, linkHref, download, onDismiss }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3500);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-24 left-4 right-4 z-50 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-2xl px-4 py-3 flex items-center justify-between shadow-lg animate-fade-in">
      <span className="text-sm">{message}</span>
      {linkText && linkHref && (
        <a href={linkHref} download={download} onClick={onDismiss} className="text-emerald-400 dark:text-emerald-600 text-sm font-medium ml-3 flex-shrink-0 whitespace-nowrap">
          {linkText}
        </a>
      )}
      {linkText && linkTo && (
        <Link to={linkTo} onClick={onDismiss} className="text-emerald-400 dark:text-emerald-600 text-sm font-medium ml-3 flex-shrink-0">
          {linkText}
        </Link>
      )}
    </div>
  );
}
