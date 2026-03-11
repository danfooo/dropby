import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth';

export function useSSE() {
  const token = useAuthStore(s => s.token);
  const queryClient = useQueryClient();
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!token) return;

    const url = `/api/events?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('status:open', () => {
      queryClient.invalidateQueries({ queryKey: ['friendStatuses'] });
    });

    es.addEventListener('status:close', () => {
      queryClient.invalidateQueries({ queryKey: ['friendStatuses'] });
    });

    es.addEventListener('going:received', () => {
      queryClient.invalidateQueries({ queryKey: ['myStatus'] });
    });

    es.onerror = () => {
      // EventSource auto-reconnects; no action needed
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [token, queryClient]);
}
