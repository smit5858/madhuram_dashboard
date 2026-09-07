// Static sample data for the HR dashboard — no Employee/Attendance/Leave/Payroll model exists
// anywhere in this codebase yet. Isolated here so it's obvious what's fake, and easy to delete
// once a real HR module is built. Also the single source for Admin's "Total Employees" KPI,
// which shows the same mock number so the two dashboards never disagree.

export const HR_MOCK_TOTALS = {
  totalEmployees: 42,
  presentToday: 37,
  absentToday: 5,
  leaveRequests: 6,
  pendingApprovals: 3,
  newEmployees: 2,
};

export interface HrAttendanceTrendRow {
  date: string;
  present: number;
  absent: number;
}

// 14 days of plausible attendance sample data, ending today.
export const getHrAttendanceTrend = (): HrAttendanceTrendRow[] => {
  const rows: HrAttendanceTrendRow[] = [];
  const today = new Date();
  for (let i = 13; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const present = isWeekend ? 0 : 34 + Math.round(Math.sin(i / 2) * 4) + (i % 3);
    const absent = isWeekend ? 0 : Math.max(0, HR_MOCK_TOTALS.totalEmployees - present);
    rows.push({
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      present,
      absent,
    });
  }
  return rows;
};

export interface HrActivityRow {
  id: string;
  name: string;
  activity: string;
  date: string;
}

export const HR_MOCK_ACTIVITY: HrActivityRow[] = [
  { id: "1", name: "Priya Shah", activity: "Applied for sick leave", date: "2026-09-03" },
  { id: "2", name: "Rohan Mehta", activity: "Leave request approved", date: "2026-09-02" },
  { id: "3", name: "Ananya Iyer", activity: "New employee onboarded", date: "2026-09-01" },
  { id: "4", name: "Karan Patel", activity: "Applied for casual leave", date: "2026-08-31" },
  { id: "5", name: "Simran Kaur", activity: "Marked absent (unplanned)", date: "2026-08-30" },
];
