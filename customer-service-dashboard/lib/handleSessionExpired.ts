import { toast } from "@/components/ui/use-toast";

let sessionHandled = false; // prevent multiple toasts

export function handleSessionExpired() {
  if (sessionHandled) return;

  sessionHandled = true;

  toast({
    title: "⚠️ Session expired",
    description: "Please log in again.",
    variant: "destructive",
    duration: 99999999,
  });

  // Redirect user safely
  if (window.location.pathname !== "/") {
    setTimeout(() => {
      sessionHandled = false;
      window.location.href = "/"; // or "/login"
    }, 1500);
  }
}