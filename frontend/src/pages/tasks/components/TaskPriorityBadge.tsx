import { TASK_PRIORITY_BADGE_CLASS, TASK_PRIORITY_LABEL, type TaskPriority } from "@/shared/constants/taskPriority";

const TaskPriorityBadge = ({ priority }: { priority?: TaskPriority | string | null }) => {
  const key = (priority && priority in TASK_PRIORITY_LABEL ? priority : "MEDIUM") as TaskPriority;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TASK_PRIORITY_BADGE_CLASS[key]}`}>
      {TASK_PRIORITY_LABEL[key]}
    </span>
  );
};

export default TaskPriorityBadge;
