import { TASK_STATUS_BADGE_CLASS, TASK_STATUS_LABEL, type TaskStatus } from "@/shared/constants/taskStatus";

const TaskStatusBadge = ({ status }: { status?: TaskStatus | string | null }) => {
  const key = (status && status in TASK_STATUS_LABEL ? status : "PENDING") as TaskStatus;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TASK_STATUS_BADGE_CLASS[key]}`}>
      {TASK_STATUS_LABEL[key]}
    </span>
  );
};

export default TaskStatusBadge;
