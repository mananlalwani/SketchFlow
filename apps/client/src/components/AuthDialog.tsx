import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AuthTrigger } from '@/components/auth/AuthTrigger';

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sign in to DrawApp</DialogTitle>
          <DialogDescription>
            Sign in to save and access your projects from anywhere.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-4">
          <AuthTrigger mode="sign-in">
            <Button className="w-full" onClick={() => onOpenChange(false)}>
              Sign In
            </Button>
          </AuthTrigger>
          <AuthTrigger mode="sign-up">
            <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
              Create Account
            </Button>
          </AuthTrigger>
        </div>
      </DialogContent>
    </Dialog>
  );
}
