import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SignInButton, SignUpButton } from '@clerk/clerk-react';

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
          <SignInButton mode="modal">
            <Button className="w-full" onClick={() => onOpenChange(false)}>
              Sign In
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
              Create Account
            </Button>
          </SignUpButton>
        </div>
        <p className="text-center text-sm text-slate-500 dark:text-slate-400 pt-2">
          Use social login or email to get started.
        </p>
      </DialogContent>
    </Dialog>
  );
}
