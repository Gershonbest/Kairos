// Password input with show/hide toggle for auth forms.

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "../ui/input";
import { cn } from "../ui/utils";

type PasswordInputProps = Omit<React.ComponentProps<"input">, "type"> & {
  containerClassName?: string;
};

export function PasswordInput({ className, containerClassName, disabled, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={cn("relative", containerClassName)}>
      <Input
        type={visible ? "text" : "password"}
        className={cn("pr-10", className)}
        disabled={disabled}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={() => setVisible((current) => !current)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
