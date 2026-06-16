'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', page],
    queryFn: async () => {
      const res = await api.get(`/notifications?page=${page}&limit=20`);
      return res.data;
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.put(`/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      await api.put('/notifications/read/all');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/notifications/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  if (isLoading && page === 1) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllAsReadMutation.mutate()}
            className="gap-1"
          >
            <CheckCheck className="w-4 h-4" />
            Tout lire
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {data?.data?.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Bell className="w-12 h-12 mx-auto mb-2 opacity-50" />
            Aucune notification
          </div>
        ) : (
          data?.data.map((notification: any) => (
            <div
              key={notification.id}
              className={cn(
                'p-4 rounded-lg border transition-colors',
                !notification.isRead
                  ? 'bg-indigo-50 border-indigo-200'
                  : 'bg-white border-gray-200'
              )}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{notification.icon || '📢'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <p className="font-medium text-gray-900">
                      {notification.title}
                    </p>
                    <div className="flex items-center gap-2 ml-2">
                      {!notification.isRead && (
                        <button
                          onClick={() => markAsReadMutation.mutate(notification.id)}
                          className="text-xs text-indigo-600 hover:text-indigo-700"
                        >
                          Marquer comme lu
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (confirm('Supprimer cette notification ?')) {
                            deleteMutation.mutate(notification.id);
                          }
                        }}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-gray-600">{notification.body}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {formatDistanceToNow(new Date(notification.createdAt), {
                      addSuffix: true,
                      locale: fr,
                    })}
                  </p>
                  {notification.link && (
                    <a
                      href={notification.link}
                      className="text-sm text-indigo-600 hover:text-indigo-700 mt-2 inline-block"
                    >
                      Voir →
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {data?.meta && data.meta.totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Précédent
          </Button>
          <span className="flex items-center px-3 text-sm text-gray-600">
            Page {page} / {data.meta.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(data.meta.totalPages, p + 1))}
            disabled={page === data.meta.totalPages}
          >
            Suivant
          </Button>
        </div>
      )}
    </div>
  );
}