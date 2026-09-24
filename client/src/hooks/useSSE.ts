import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth';
import { baseURL, eventsApi } from '../api';

const MAX_RETRY_MS = 30_000;

export function useSSE() {
  const token = useAuthStore(s => s.token);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!token) return;

    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryMs = 1000;
    let stopped = false;

    const scheduleReconnect = () => {
      if (stopped) return;
      retryTimer = setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
    };

    // Each connection needs a fresh single-use ticket, so the browser's own automatic
    // reconnect (which reuses the URL) is rejected; when that leaves the stream closed,
    // reconnect here with a new ticket.
    async function connect() {
      let ticket: string;
      try {
        ({ ticket } = await eventsApi.ticket());
      } catch {
        scheduleReconnect();
        return;
      }
      if (stopped) return;

      es = new EventSource(`${baseURL}/events?ticket=${encodeURIComponent(ticket)}`);

      es.addEventListener('connected', () => { retryMs = 1000; });

      es.addEventListener('status:open', () => {
        queryClient.invalidateQueries({ queryKey: ['friendStatuses'] });
      });

      es.addEventListener('status:close', () => {
        queryClient.invalidateQueries({ queryKey: ['friendStatuses'] });
      });

      es.addEventListener('going:received', () => {
        queryClient.invalidateQueries({ queryKey: ['myStatus'] });
        queryClient.invalidateQueries({ queryKey: ['upcomingSessions'] });
      });

      es.addEventListener('friend:joined', () => {
        queryClient.invalidateQueries({ queryKey: ['friends'] });
        // A door-specific link adds the new friend to the open door right away.
        queryClient.invalidateQueries({ queryKey: ['myStatus'] });
      });

      es.onerror = () => {
        if (es?.readyState === EventSource.CLOSED) {
          es.close();
          es = null;
          scheduleReconnect();
        }
      };
    }

    connect();

    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      es?.close();
    };
  }, [token, queryClient]);
}
