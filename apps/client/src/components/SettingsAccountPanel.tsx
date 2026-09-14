import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function SettingsAccountPanel({
  user,
  firstName,
  lastName,
  setFirstName,
  setLastName,
  isSavingProfile,
  saveProfile,
  openSecurity,
}: {
  user: {
    imageUrl: string;
    fullName: string | null;
    username: string | null;
    primaryEmailAddress?: { emailAddress: string } | null;
  };
  firstName: string;
  lastName: string;
  setFirstName: (value: string) => void;
  setLastName: (value: string) => void;
  isSavingProfile: boolean;
  saveProfile: () => void;
  openSecurity: () => void;
}) {
  return (
<div className="divide-y divide-stone-200 dark:divide-white/[0.08]">
      <section className="py-5">
        <div className="flex items-center gap-3">
          <img
            src={user.imageUrl}
            alt=""
            className="h-11 w-11 rounded-xl border border-stone-200 object-cover dark:border-white/[0.1]"
          />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold tracking-[-0.02em] text-stone-950 dark:text-stone-50">
              {user.fullName || user.username || 'SketchFlow user'}
            </p>
            <p className="mt-1 truncate text-xs text-stone-500 dark:text-stone-400">
              {user.primaryEmailAddress?.emailAddress}
            </p>
          </div>
        </div>
      </section>

      <section className="py-5">
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-500 dark:text-stone-400">
              Profile
            </p>
            <h3 className="mt-1 text-base font-semibold tracking-[-0.02em] text-stone-900 dark:text-stone-100">
              How collaborators see you
            </h3>
          </div>
          <p className="hidden text-right text-xs text-stone-500 dark:text-stone-400 sm:block">
            Changes save to your account.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-medium text-stone-600 dark:text-stone-300">
            First name
            <Input
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              className="h-10 border-stone-300 bg-white dark:border-white/[0.1] dark:bg-stone-950/30"
            />
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-stone-600 dark:text-stone-300">
            Last name
            <Input
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              className="h-10 border-stone-300 bg-white dark:border-white/[0.1] dark:bg-stone-950/30"
            />
          </label>
        </div>
        <Button
          className="mt-5 bg-stone-900 text-amber-100 hover:bg-stone-800 dark:bg-amber-300 dark:text-stone-950 dark:hover:bg-amber-200"
          onClick={() => void saveProfile()}
          disabled={isSavingProfile}
        >
          {isSavingProfile ? 'Saving…' : 'Save profile'}
        </Button>
      </section>

      <section className="grid gap-4 py-5 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-500 dark:text-stone-400">
            Security
          </p>
          <h3 className="mt-1 text-base font-semibold tracking-[-0.02em] text-stone-900 dark:text-stone-100">
            Sign-in & protection
          </h3>
          <p className="mt-2 max-w-md text-xs leading-5 text-stone-500 dark:text-stone-400">
            Passwords, sign-in methods, and multi-factor authentication are handled securely by
            Clerk.
          </p>
        </div>
        <Button
          variant="outline"
          className="border-stone-300 dark:border-white/[0.1]"
          onClick={openSecurity}
        >
          Security settings
        </Button>
      </section>
    </div>

  );
}
