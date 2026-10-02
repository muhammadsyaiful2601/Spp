import { BadgeCheck } from "lucide-react";

export function Toast({
  toast,
}: {
  toast: string;
}) {
  return (
          <div className="toast">
            <BadgeCheck size={17} /> {toast}
          </div>
        
  );
}

export default Toast;
