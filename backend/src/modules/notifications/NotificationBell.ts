'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useSocket } from '@/hooks/useSocket';
import { useAuth } from '@/hooks/useAuth';
import { Bell, X, CheckCheck, Trash2, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  icon?: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

interface NotificationsResponse {
  data: Notification[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    unreadCount: number;
  };
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { socket } = useSocket();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ==========================================
  // FETCH NOTIFICATIONS
  // ==========================================

  const { data, isLoading, refetch } = useQuery<NotificationsResponse>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await api.get('/notifications?limit=10');
      return res.data;
    },
    enabled: !!user,
    refetchInterval: 30000, // Rafraîchir toutes les 30s
    staleTime: 15000,
  });

  const unreadCount = data?.meta?.unreadCount || 0;

  // ==========================================
  // SOCKET - REAL-TIME NOTIFICATIONS
  // ==========================================

  useEffect(() => {
    if (!socket || !user) return;

    const handleNewNotification = (notification: Notification) => {
      // Invalider pour refetch propre
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      
      // Jouer un son si disponible
      try {
        const audio = new Audio('/notification.mp3');
        audio.volume = 0.3;
        audio.play().catch(() => {});
      } catch {
        // Silencieux si erreur
      }
    };

    socket.on('notification', handleNewNotification);

    return () => {
      socket.off('notification', handleNewNotification);
    };
  }, [socket, user, queryClient]);

  // ==========================================
  // MARK AS READ
  // ==========================================

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

  // ==========================================
  // HANDLERS
  // ==========================================

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id);
    }

    if (notification.link) {
      window.location.href = notification.link;
    }

    setIsOpen(false);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Supprimer cette notification ?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleMarkAllRead = () => {
    if (unreadCount === 0) return;
    markAllAsReadMutation.mutate();
  };

  // ==========================================
  // CLOSE ON CLICK OUTSIDE
  // ==========================================

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ==========================================
  // RENDER
  // ==========================================

  const notifications = data?.data || [];
  const hasUnread = unreadCount > 0;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'relative p-2 rounded-full transition-colors',
          hasUnread ? 'text-indigo-600 hover:bg-indigo-50' : 'text-gray-600 hover:bg-gray-100'
        )}
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 max-h-[500px] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-50 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
            <h3 className="font-semibold text-gray-900">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  disabled={markAllAsReadMutation.isPending}
                  className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 px-2 py-1 rounded hover:bg-indigo-50 transition-colors"
                >
                  {markAllAsReadMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <CheckCheck className="w-3 h-3" />
                  )}
                  Tout lire
                </button>
              )}
              <Link
                href="/notifications"
                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
              >
                Voir tout
              </Link>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Bell className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-sm font-medium">Aucune notification</p>
                <p className="text-xs">Les notifications apparaîtront ici</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={cn(
                      'group p-4 cursor-pointer transition-colors hover:bg-gray-50',
                      !notification.isRead && 'bg-indigo-50/30 hover:bg-indigo-50'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-lg">
                        {notification.icon || '📢'}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-gray-900 line-clamp-1">
                            {notification.title}
                          </p>
                          <button
                            onClick={(e) => handleDelete(e, notification.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-all"
                            aria-label="Supprimer"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                          </button>
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-2">
                          {notification.body}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {formatDistanceToNow(new Date(notification.createdAt), {
                            addSuffix: true,
                            locale: fr,
                          })}
                        </p>
                      </div>

                      {/* Unread dot */}
                      {!notification.isRead && (
                        <div className="flex-shrink-0 w-2 h-2 mt-2 rounded-full bg-indigo-600" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-gray-100 p-2 text-center bg-gray-50/50">
              <Link
                href="/notifications"
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Voir toutes les notifications
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}