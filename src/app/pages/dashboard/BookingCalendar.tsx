// Calendar view of tenant bookings.

import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Calendar, ChevronLeft, ChevronRight, Plus, Clock, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../../../lib/api/client";

interface Booking {
  id: string;
  client: string;
  service: string;
  time: string;
  duration: number;
  color: string;
}

export function BookingCalendar() {
  const navigate = useNavigate();
  const [view, setView] = useState<"week" | "day">("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [bookingsByDate, setBookingsByDate] = useState<Record<string, Booking[]>>({});

  const hours = Array.from({ length: 12 }, (_, i) => i + 8); // 8 AM to 7 PM

  const getWeekDays = () => {
    const days = [];
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay() + 1); // Monday

    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek);
      day.setDate(startOfWeek.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const formatDate = (date: Date) => {
    return date.toISOString().split("T")[0];
  };

  const formatDayHeader = (date: Date) => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return `${days[date.getDay()]} ${date.getDate()}`;
  };

  const weekDays = getWeekDays();
  const colorByStatus = useMemo(
    () => ({
      confirmed: "bg-purple-100 border-purple-300 text-purple-900",
      pending: "bg-blue-100 border-blue-300 text-blue-900",
      completed: "bg-green-100 border-green-300 text-green-900",
      cancelled: "bg-gray-100 border-gray-300 text-gray-700",
    }),
    []
  );

  useEffect(() => {
    api
      .listBookings()
      .then((rows) => {
        const mapped: Record<string, Booking[]> = {};
        for (const row of rows) {
          const start = new Date(row.start_at);
          const end = new Date(row.end_at);
          const key = start.toISOString().split("T")[0];
          const duration = Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000));
          if (!mapped[key]) {
            mapped[key] = [];
          }
          mapped[key].push({
            id: row.id,
            client: row.client_name,
            service: row.service_name,
            time: `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`,
            duration,
            color: colorByStatus[row.status as keyof typeof colorByStatus] ?? colorByStatus.pending,
          });
        }
        setBookingsByDate(mapped);
      })
      .catch(() => setBookingsByDate({}));
  }, [colorByStatus]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Booking Calendar</h1>
          <p className="text-gray-600 mt-1">Manage your appointments and schedule</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate("/dashboard/availability")}>
            <Clock className="w-4 h-4 mr-2" />
            Edit availability
          </Button>
          <Button className="bg-[#7c3aed] hover:bg-[#6d28d9]">
            <Plus className="w-4 h-4 mr-2" />
            New Booking
          </Button>
        </div>
      </div>

      {/* Calendar Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  const newDate = new Date(currentDate);
                  newDate.setDate(currentDate.getDate() - 7);
                  setCurrentDate(newDate);
                }}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-gray-600" />
                <span className="font-medium">
                  {currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </span>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  const newDate = new Date(currentDate);
                  newDate.setDate(currentDate.getDate() + 7);
                  setCurrentDate(newDate);
                }}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentDate(new Date())}
              >
                Today
              </Button>
            </div>

            <div className="flex gap-2">
              <Button
                variant={view === "week" ? "default" : "outline"}
                size="sm"
                onClick={() => setView("week")}
                className={view === "week" ? "bg-[#7c3aed] hover:bg-[#6d28d9]" : ""}
              >
                Week
              </Button>
              <Button
                variant={view === "day" ? "default" : "outline"}
                size="sm"
                onClick={() => setView("day")}
                className={view === "day" ? "bg-[#7c3aed] hover:bg-[#6d28d9]" : ""}
              >
                Day
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calendar Grid */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              {/* Day Headers */}
              <div className="grid grid-cols-8 border-b border-gray-200">
                <div className="p-4 bg-gray-50 border-r border-gray-200">
                  <span className="text-sm font-medium text-gray-600">Time</span>
                </div>
                {weekDays.map((day) => (
                  <div
                    key={day.toISOString()}
                    className={`p-4 text-center border-r border-gray-200 ${
                      formatDate(day) === formatDate(new Date())
                        ? "bg-[#7c3aed]/5"
                        : "bg-gray-50"
                    }`}
                  >
                    <div className="text-sm font-medium">{formatDayHeader(day)}</div>
                  </div>
                ))}
              </div>

              {/* Time Slots */}
              <div className="relative">
                {hours.map((hour) => (
                  <div key={hour} className="grid grid-cols-8 border-b border-gray-200">
                    <div className="p-4 bg-gray-50 border-r border-gray-200">
                      <span className="text-sm text-gray-600">
                        {hour.toString().padStart(2, "0")}:00
                      </span>
                    </div>
                    {weekDays.map((day) => {
                      const dateKey = formatDate(day);
                      const dayBookings = bookingsByDate[dateKey] || [];
                      const hourBookings = dayBookings.filter((booking) => {
                        const bookingHour = parseInt(booking.time.split(":")[0]);
                        return bookingHour === hour;
                      });

                      return (
                        <div
                          key={`${dateKey}-${hour}`}
                          className="p-2 border-r border-gray-200 min-h-[80px] hover:bg-gray-50 transition-colors cursor-pointer"
                        >
                          {hourBookings.map((booking) => (
                            <div
                              key={booking.id}
                              className={`${booking.color} border rounded-lg p-2 mb-2 cursor-move hover:shadow-md transition-shadow`}
                            >
                              <div className="flex items-center gap-1 mb-1">
                                <User className="w-3 h-3" />
                                <span className="text-xs font-medium truncate">
                                  {booking.client}
                                </span>
                              </div>
                              <div className="text-xs truncate">{booking.service}</div>
                              <div className="flex items-center gap-1 mt-1">
                                <Clock className="w-3 h-3" />
                                <span className="text-xs">{booking.duration} min</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-6">
            <span className="text-sm font-medium text-gray-600">Color Legend:</span>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-purple-100 border border-purple-300" />
              <span className="text-sm">Consultation</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-blue-100 border border-blue-300" />
              <span className="text-sm">Strategy Session</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-green-100 border border-green-300" />
              <span className="text-sm">Financial Review</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
