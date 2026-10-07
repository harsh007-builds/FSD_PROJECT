import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useProjects } from '../hooks/useProjects';

const CalendarView = () => {
  const { tasks, projects } = useProjects();
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  // Build calendar grid
  const cells = [];
  for (let i = 0; i < startDayOfWeek; i++) {
    cells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(d);
  }

  // Get tasks for a specific day
  const getTasksForDay = (day) => {
    const date = new Date(year, month, day);
    date.setHours(0, 0, 0, 0);
    
    return tasks.filter(t => {
      if (!t.dueDate) return false;
      const due = new Date(t.dueDate);
      due.setHours(0, 0, 0, 0);
      return due.getTime() === date.getTime();
    });
  };

  // Get project deadlines for a specific day
  const getProjectDeadlinesForDay = (day) => {
    const date = new Date(year, month, day);
    date.setHours(0, 0, 0, 0);
    
    return projects.filter(p => {
      if (!p.deadline) return false;
      const dl = new Date(p.deadline);
      dl.setHours(0, 0, 0, 0);
      return dl.getTime() === date.getTime();
    });
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isToday = (day) => {
    const d = new Date(year, month, day);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  };

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">{monthName}</h1>
        <div className="flex items-center gap-2">
          <button onClick={goToday} className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-sm text-slate-300 hover:text-white transition-colors">
            Today
          </button>
          <button onClick={prevMonth} className="p-2 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-white transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={nextMonth} className="p-2 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-white transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-7 mb-1">
        {dayNames.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wider py-3">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 border border-slate-800 rounded-xl overflow-hidden">
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} className="h-28 bg-slate-950/30 border-b border-r border-slate-800/30" />;
          }

          const dayTasks = getTasksForDay(day);
          const dayProjectDeadlines = getProjectDeadlinesForDay(day);
          const _isToday = isToday(day);

          return (
            <div 
              key={day} 
              className={`h-28 p-1.5 border-b border-r border-slate-800/30 transition-colors ${
                _isToday ? 'bg-blue-500/5' : 'bg-slate-950/20 hover:bg-slate-900/30'
              }`}
            >
              <div className={`text-xs font-medium mb-1 px-1 ${
                _isToday ? 'text-blue-400' : 'text-slate-500'
              }`}>
                {_isToday ? (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold">
                    {day}
                  </span>
                ) : day}
              </div>
              <div className="space-y-0.5 overflow-y-auto max-h-[72px]">
                {dayProjectDeadlines.map(p => (
                  <div key={p.id} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 truncate border border-purple-500/20">
                    📁 {p.name}
                  </div>
                ))}
                {dayTasks.map(t => (
                  <div 
                    key={t.id} 
                    className={`text-[10px] px-1.5 py-0.5 rounded truncate border ${
                      t.status === 'Completed' 
                        ? 'bg-green-500/10 text-green-400 border-green-500/20 line-through' 
                        : t.priority === 'High' 
                          ? 'bg-red-500/10 text-red-400 border-red-500/20' 
                          : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    }`}
                  >
                    {t.task}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CalendarView;
