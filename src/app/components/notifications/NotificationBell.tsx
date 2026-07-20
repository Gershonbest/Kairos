// Dashboard notification bell with unread badge and recent list.

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Bell } from "lucide-react";
import { api, type AppNotification } from "../../../lib/api/client";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

const POLL_MS = 30_000;

function formatRelativeTime(iso?: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshCount = useCallback(async () => {
    try {
      const res = await api.getUnreadNotificationCount();
      setUnreadCount(res.count);
    } catch {
      // Non-blocking while dashboard stays open.
    }
  }, []);

  const refreshList = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.listNotifications(20);
      setItems(rows);
      setUnreadCount(rows.filter((row) => !row.is_read).length);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCount();
    const id = window.setInterval(() => {
      void refreshCount();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [refreshCount]);

  useEffect(() => {
    if (open) {
      void refreshList();
    }
  }, [open, refreshList]);

  const handleOpenItem = async (item: AppNotification) => {
    if (!item.is_read) {
      try {
        await api.markNotificationRead(item.id);
        setItems((prev) =>
          prev.map((row) =>
            row.id === item.id ? { ...row, is_read: true, read_at: new Date().toISOString() } : row
          )
        );
        setUnreadCount((count) => Math.max(0, count - 1));
      } catch {
        // Still navigate even if mark-read fails.
      }
    }
    setOpen(false);
    const target = item.booking_id
      ? `/dashboard/calendar?booking=${encodeURIComponent(item.booking_id)}`
      : "/dashboard/calendar";
    navigate(target);
  };

  const handleMarkAll = async () => {
    try {
      await api.markAllNotificationsRead();
      setItems((prev) =>
        prev.map((row) => ({ ...row, is_read: true, read_at: row.read_at ?? new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch {
      // Ignore transient failures.
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="w-5 h-5 text-gray-700" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-primary text-white text-[10px] font-semibold flex items-center justify-center">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">Notifications</p>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void handleMarkAll()}
              className="text-xs text-primary hover:underline"
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {loading && items.length === 0 ? (
            <p className="px-4 py-8 text-sm text-gray-500 text-center">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-8 text-sm text-gray-500 text-center">No notifications yet</p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void handleOpenItem(item)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                  item.is_read ? "bg-card" : "bg-primary/5"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900">{item.title}</p>
                  {!item.is_read && <span className="mt-1 w-2 h-2 rounded-full bg-primary shrink-0" />}
                </div>
                <p className="text-xs text-gray-600 mt-1 line-clamp-2">{item.body}</p>
                <p className="text-[11px] text-gray-400 mt-1">{formatRelativeTime(item.created_at)}</p>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
