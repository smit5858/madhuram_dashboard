import { z } from "zod";
import { getTodayISODate } from "@/shared/utils/date";
import { calcDurationMinutes } from "@/shared/utils/timesheet";

export const timesheetEntrySchema = z
  .object({
    workDate: z.string().min(1, "Date is required"),
    // "task:<id>" | "project:<id>" | "none" (an entry whose task/project was since deleted)
    link: z.string().min(1, "Select the task or project you worked on"),
    description: z.string().trim().min(1, "Describe the work you did").max(2000, "Must be under 2000 characters"),
    startTime: z.string().min(1, "Start time is required"),
    endTime: z.string().min(1, "End time is required"),
    endsNextDay: z.boolean(),
    notes: z.string().max(2000, "Must be under 2000 characters").optional(),
  })
  .superRefine((values, ctx) => {
    if (values.workDate && values.workDate > getTodayISODate()) {
      ctx.addIssue({ code: "custom", path: ["workDate"], message: "You cannot log work for a future date" });
    }
    if (values.startTime && values.endTime && calcDurationMinutes(values.startTime, values.endTime, values.endsNextDay) === null) {
      ctx.addIssue({
        code: "custom",
        path: ["endTime"],
        message: values.endsNextDay
          ? "A work log must be shorter than 24 hours"
          : "End time must be after start time (tick \"Ends next day\" if you worked past midnight)",
      });
    }
  });

export type TimesheetEntryFormValues = z.infer<typeof timesheetEntrySchema>;
