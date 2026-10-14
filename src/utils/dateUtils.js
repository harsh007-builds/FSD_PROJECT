/**
 * Safe Date & Timezone utilities for StudySync Calendar
 * Prevents date-shift bugs across different timezones by normalizing to local date keys (YYYY-MM-DD).
 */

// Formats year, month (0-indexed), day into YYYY-MM-DD string
export const formatDateKey = (year, month, day) => {
  const y = String(year);
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Extracts YYYY-MM-DD string from any date input
export const toDateKey = (val) => {
  if (!val) return '';
  if (typeof val === 'string') {
    // If it already contains YYYY-MM-DD, extract it safely
    const match = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
  }
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Creates a safe ISO date string anchored at 12:00:00 UTC to prevent shifting in any timezone
export const createSafeDateString = (year, month, day) => {
  const key = formatDateKey(year, month, day);
  return `${key}T12:00:00.000Z`;
};

// Creates ISO string from YYYY-MM-DD input field
export const fromInputDateToIso = (dateString) => {
  if (!dateString) return null;
  return `${dateString}T12:00:00.000Z`;
};

// Formats for <input type="date" value={...} />
export const toInputDateFormat = (val) => {
  return toDateKey(val);
};

// Today's date key
export const getTodayKey = () => {
  const now = new Date();
  return formatDateKey(now.getFullYear(), now.getMonth(), now.getDate());
};

// Check if a task is overdue
export const isTaskOverdue = (dueDate, status) => {
  if (!dueDate || status === 'Completed') return false;
  const dueKey = toDateKey(dueDate);
  const todayKey = getTodayKey();
  return dueKey < todayKey;
};

// Check if a task is due today
export const isTaskDueToday = (dueDate, status) => {
  if (!dueDate || status === 'Completed') return false;
  return toDateKey(dueDate) === getTodayKey();
};

// Check if a task is due upcoming (today or next 3 days)
export const isTaskUpcoming = (dueDate, status) => {
  if (!dueDate || status === 'Completed') return false;
  const dueKey = toDateKey(dueDate);
  const todayKey = getTodayKey();
  if (dueKey < todayKey) return false;
  
  const today = new Date();
  const threeDaysOut = new Date(today);
  threeDaysOut.setDate(threeDaysOut.getDate() + 3);
  const futureKey = toDateKey(threeDaysOut);
  return dueKey <= futureKey;
};

// Get the 7 days for a given week (Sunday - Saturday)
export const getWeekDays = (referenceDate = new Date()) => {
  const d = new Date(referenceDate);
  const dayOfWeek = d.getDay(); // 0 is Sunday
  const startOfWeek = new Date(d);
  startOfWeek.setDate(d.getDate() - dayOfWeek);
  startOfWeek.setHours(0, 0, 0, 0);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(startOfWeek);
    cur.setDate(startOfWeek.getDate() + i);
    days.push({
      date: cur,
      year: cur.getFullYear(),
      month: cur.getMonth(),
      day: cur.getDate(),
      dateKey: formatDateKey(cur.getFullYear(), cur.getMonth(), cur.getDate()),
      isToday: formatDateKey(cur.getFullYear(), cur.getMonth(), cur.getDate()) === getTodayKey(),
    });
  }
  return days;
};

// Get Month Grid structure
export const getMonthGrid = (year, month) => {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay(); // 0 to 6
  const daysInMonth = lastDay.getDate();

  const cells = [];
  // Leading empty cells
  for (let i = 0; i < startDayOfWeek; i++) {
    cells.push(null);
  }
  // Days of month
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = formatDateKey(year, month, d);
    cells.push({
      day: d,
      dateKey,
      isToday: dateKey === getTodayKey(),
    });
  }
  return cells;
};

// Format a date key nicely: "Thu, Oct 15, 2026"
export const formatHumanDate = (val) => {
  if (!val) return '';
  const key = toDateKey(val);
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return '';
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};
