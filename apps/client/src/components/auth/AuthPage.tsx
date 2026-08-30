import {
  AuthenticateWithRedirectCallback,
  useAuth,
  useClerk,
  useSignIn,
  useSignUp,
} from '@clerk/clerk-react';
import { ArrowLeft, Loader2, LockKeyhole, Mail, PenTool } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type AuthMode = 'sign-in' | 'sign-up';
type AuthStep = 'credentials' | 'signup-code' | 'mfa-code' | 'reset-code' | 'new-password';
type MfaStrategy = 'email_code' | 'phone_code' | 'totp' | 'backup_code';

function errorMessage(error: Error) {
  return error.message || 'Something went wrong. Please try again.';
}

function AuthForm({ mode }: { mode: AuthMode }) {
  const navigate = useNavigate();
  const { isSignedIn } = useAuth();
  const clerk = useClerk();
  const signInState = useSignIn();
  const signUpState = useSignUp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<AuthStep>('credentials');
  const [mfaStrategy, setMfaStrategy] = useState<MfaStrategy | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isLoaded = signInState.isLoaded && signUpState.isLoaded;

  useEffect(() => {
    if (isSignedIn) navigate('/draw', { replace: true });
  }, [isSignedIn, navigate]);

  useEffect(() => {
    setStep('credentials');
    setPassword('');
    setCode('');
    setError('');
    setMfaStrategy(null);
  }, [mode]);

  const finishSession = async (sessionId: string | null) => {
    if (!sessionId) throw new Error('Clerk did not create a session.');
    await clerk.setActive({ session: sessionId });
    navigate('/draw', { replace: true });
  };

  type SignInResult = Awaited<ReturnType<NonNullable<typeof signInState.signIn>['create']>>;

  const continueSignIn = async (result: SignInResult) => {
    if (result.status === 'complete') {
      await finishSession(result.createdSessionId);
      return;
    }
    if (result.status !== 'needs_second_factor') {
      throw new Error('This sign-in method needs an unsupported verification step.');
    }

    const factors = result.supportedSecondFactors ?? [];
    const factor =
      factors.find(({ strategy }) => strategy === 'email_code') ??
      factors.find(({ strategy }) => strategy === 'phone_code') ??
      factors.find(({ strategy }) => strategy === 'totp') ??
      factors.find(({ strategy }) => strategy === 'backup_code');
    if (!factor) throw new Error('No supported second-factor method is available.');
    if (factor.strategy === 'email_link') {
      throw new Error('Email-link second-factor verification is not supported yet.');
    }

    if (factor.strategy === 'email_code') {
      await result.prepareSecondFactor({
        strategy: 'email_code',
        emailAddressId: factor.emailAddressId,
      });
    } else if (factor.strategy === 'phone_code') {
      await result.prepareSecondFactor({
        strategy: 'phone_code',
        phoneNumberId: factor.phoneNumberId,
      });
    }
    setMfaStrategy(factor.strategy);
    setCode('');
    setStep('mfa-code');
  };

  const submitCredentials = async (event: FormEvent) => {
    event.preventDefault();
    if (!isLoaded) return;
    setError('');
    setIsSubmitting(true);
    try {
      if (mode === 'sign-in') {
        const result = await signInState.signIn.create({ identifier: email, password });
        await continueSignIn(result);
      } else {
        const result = await signUpState.signUp.create({ emailAddress: email, password });
        if (result.status === 'complete') {
          await finishSession(result.createdSessionId);
        } else {
          await signUpState.signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
          setStep('signup-code');
        }
      }
    } catch (caught) {
      setError(errorMessage(caught instanceof Error ? caught : new Error('Sign-in failed.')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyEmail = async (event: FormEvent) => {
    event.preventDefault();
    if (!signUpState.isLoaded) return;
    setError('');
    setIsSubmitting(true);
    try {
      const result = await signUpState.signUp.attemptEmailAddressVerification({ code });
      if (result.status !== 'complete') throw new Error('That code could not be verified.');
      await finishSession(result.createdSessionId);
    } catch (caught) {
      setError(errorMessage(caught instanceof Error ? caught : new Error('Verification failed.')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const startPasswordReset = async () => {
    if (!signInState.isLoaded || !email) {
      setError('Enter your email address first.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      await signInState.signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email,
      });
      setCode('');
      setStep('reset-code');
    } catch (caught) {
      setError(
        errorMessage(caught instanceof Error ? caught : new Error('Password reset failed.')),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyResetCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!signInState.isLoaded) return;
    setError('');
    setIsSubmitting(true);
    try {
      const result = await signInState.signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code,
      });
      if (result.status !== 'needs_new_password')
        throw new Error('That code could not be verified.');
      setPassword('');
      setStep('new-password');
    } catch (caught) {
      setError(errorMessage(caught instanceof Error ? caught : new Error('Verification failed.')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const setNewPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!signInState.isLoaded) return;
    setError('');
    setIsSubmitting(true);
    try {
      const result = await signInState.signIn.resetPassword({
        password,
        signOutOfOtherSessions: true,
      });
      await continueSignIn(result);
    } catch (caught) {
      setError(
        errorMessage(caught instanceof Error ? caught : new Error('Password reset failed.')),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifySecondFactor = async (event: FormEvent) => {
    event.preventDefault();
    if (!signInState.isLoaded || !mfaStrategy) return;
    setError('');
    setIsSubmitting(true);
    try {
      const result = await signInState.signIn.attemptSecondFactor({ strategy: mfaStrategy, code });
      if (result.status !== 'complete') throw new Error('That verification code was not accepted.');
      await finishSession(result.createdSessionId);
    } catch (caught) {
      setError(errorMessage(caught instanceof Error ? caught : new Error('Verification failed.')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const otherMode = mode === 'sign-in' ? 'sign-up' : 'sign-in';
  const title = mode === 'sign-in' ? 'Welcome back' : 'Make room for your ideas';

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f6f2e9] px-4 py-10 text-stone-950 dark:bg-[#171513] dark:text-stone-50">
      <div className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(to_right,rgba(120,113,108,.09)_1px,transparent_1px),linear-gradient(to_bottom,rgba(120,113,108,.09)_1px,transparent_1px)] [background-size:32px_32px] dark:opacity-20" />
      <div className="absolute left-[12%] top-[18%] h-40 w-40 rounded-full bg-amber-300/30 blur-3xl" />
      <div className="relative grid w-full max-w-4xl overflow-hidden rounded-[28px] border border-stone-200/80 bg-stone-50 shadow-2xl shadow-stone-950/10 dark:border-white/[0.09] dark:bg-[#211e1b] dark:shadow-black/40 md:grid-cols-[0.9fr_1.1fr]">
        <aside className="relative hidden min-h-[620px] flex-col justify-between overflow-hidden bg-stone-900 p-9 text-stone-50 md:flex">
          <div className="absolute -bottom-24 -right-20 h-72 w-72 rounded-full border-[46px] border-amber-300/90" />
          <div className="absolute bottom-36 right-16 h-24 w-24 rotate-12 rounded-3xl border border-white/20 bg-white/[0.06]" />
          <Link
            to="/draw"
            className="relative flex items-center gap-3 font-semibold tracking-[-0.03em]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-300 text-stone-950">
              <PenTool className="h-5 w-5" />
            </span>
            SketchFlow
          </Link>
          <div className="relative max-w-xs pb-16">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-300">
              Your visual workspace
            </p>
            <h2 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.055em]">
              Ideas move faster when everyone can see them.
            </h2>
            <p className="mt-5 text-sm leading-6 text-stone-400">
              Sketch, explain, and shape the next thing together—without losing your flow.
            </p>
          </div>
        </aside>

        <section className="p-6 sm:p-10 md:p-12">
          <Link
            to="/draw"
            className="mb-10 inline-flex items-center gap-2 text-sm text-stone-500 transition-colors hover:text-stone-950 dark:text-stone-400 dark:hover:text-stone-100"
          >
            <ArrowLeft className="h-4 w-4" /> Back to canvas
          </Link>
          <div className="mb-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
              {mode === 'sign-in' ? 'Sign in' : 'Create account'}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">{title}</h1>
            <p className="mt-3 text-sm leading-6 text-stone-500 dark:text-stone-400">
              Save canvases, sync your work, and collaborate in real time.
            </p>
          </div>

          {step === 'credentials' && (
            <>
              <form className="space-y-4" onSubmit={submitCredentials}>
                <label className="block text-sm font-medium">
                  Email address
                  <div className="relative mt-2">
                    <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                    <Input
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      className="h-12 bg-white pl-10 dark:bg-black/10"
                    />
                  </div>
                </label>
                <label className="block text-sm font-medium">
                  Password
                  <div className="relative mt-2">
                    <LockKeyhole className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                    <Input
                      type="password"
                      autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                      required
                      minLength={8}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="At least 8 characters"
                      className="h-12 bg-white pl-10 dark:bg-black/10"
                    />
                  </div>
                </label>
                {mode === 'sign-in' && (
                  <button
                    type="button"
                    className="text-sm font-medium text-amber-700 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200"
                    onClick={() => void startPasswordReset()}
                  >
                    Forgot your password?
                  </button>
                )}
                {error && (
                  <p
                    role="alert"
                    className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
                  >
                    {error}
                  </p>
                )}
                <Button
                  className="h-12 w-full bg-stone-900 text-amber-100 hover:bg-stone-800 dark:bg-amber-300 dark:text-stone-950 dark:hover:bg-amber-200"
                  disabled={!isLoaded || isSubmitting}
                >
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {mode === 'sign-in' ? 'Continue to SketchFlow' : 'Create my account'}
                </Button>
              </form>
            </>
          )}

          {step === 'signup-code' && (
            <form className="space-y-5" onSubmit={verifyEmail}>
              <p className="text-sm leading-6 text-stone-500 dark:text-stone-400">
                We sent a six-digit verification code to{' '}
                <strong className="text-stone-900 dark:text-stone-100">{email}</strong>.
              </p>
              <label className="block text-sm font-medium">
                Verification code
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="000000"
                  className="mt-2 h-12 bg-white text-center text-lg tracking-[0.35em] dark:bg-black/10"
                />
              </label>
              {error && (
                <p
                  role="alert"
                  className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
                >
                  {error}
                </p>
              )}
              <Button className="h-12 w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Verify email
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setStep('credentials')}
              >
                Use a different email
              </Button>
            </form>
          )}

          {step === 'reset-code' && (
            <form className="space-y-5" onSubmit={verifyResetCode}>
              <p className="text-sm leading-6 text-stone-500 dark:text-stone-400">
                Clerk sent a password reset code to{' '}
                <strong className="text-stone-900 dark:text-stone-100">{email}</strong>.
              </p>
              <label className="block text-sm font-medium">
                Reset code
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="000000"
                  className="mt-2 h-12 bg-white text-center text-lg tracking-[0.35em] dark:bg-black/10"
                />
              </label>
              {error && (
                <p
                  role="alert"
                  className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
                >
                  {error}
                </p>
              )}
              <Button className="h-12 w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Verify reset code
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setStep('credentials')}
              >
                Back to sign in
              </Button>
            </form>
          )}

          {step === 'new-password' && (
            <form className="space-y-5" onSubmit={setNewPassword}>
              <p className="text-sm leading-6 text-stone-500 dark:text-stone-400">
                Choose a new password. Other sessions will be signed out for your protection.
              </p>
              <label className="block text-sm font-medium">
                New password
                <div className="relative mt-2">
                  <LockKeyhole className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <Input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 8 characters"
                    className="h-12 bg-white pl-10 dark:bg-black/10"
                  />
                </div>
              </label>
              {error && (
                <p
                  role="alert"
                  className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
                >
                  {error}
                </p>
              )}
              <Button className="h-12 w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Set new password
              </Button>
            </form>
          )}

          {step === 'mfa-code' && (
            <form className="space-y-5" onSubmit={verifySecondFactor}>
              <p className="text-sm leading-6 text-stone-500 dark:text-stone-400">
                {mfaStrategy === 'totp' && 'Enter the code from your authenticator app.'}
                {mfaStrategy === 'backup_code' && 'Enter one of your backup codes.'}
                {mfaStrategy === 'email_code' && 'Enter the verification code sent to your email.'}
                {mfaStrategy === 'phone_code' && 'Enter the verification code sent to your phone.'}
              </p>
              <label className="block text-sm font-medium">
                Verification code
                <Input
                  autoComplete="one-time-code"
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder={mfaStrategy === 'backup_code' ? 'Backup code' : '000000'}
                  className="mt-2 h-12 bg-white text-center text-lg tracking-[0.25em] dark:bg-black/10"
                />
              </label>
              {error && (
                <p
                  role="alert"
                  className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
                >
                  {error}
                </p>
              )}
              <Button className="h-12 w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Complete sign in
              </Button>
            </form>
          )}

          <p className="mt-7 text-center text-sm text-stone-500 dark:text-stone-400">
            {mode === 'sign-in' ? 'New to SketchFlow?' : 'Already have an account?'}{' '}
            <Link
              to={`/auth/${otherMode}`}
              className="font-semibold text-stone-950 underline decoration-amber-400 decoration-2 underline-offset-4 dark:text-stone-50"
            >
              {mode === 'sign-in' ? 'Create an account' : 'Sign in'}
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}

export function AuthPage() {
  const { mode } = useParams();
  if (mode !== 'sign-in' && mode !== 'sign-up') return <Navigate to="/auth/sign-in" replace />;
  return <AuthForm mode={mode} />;
}

export function SsoCallbackPage() {
  return (
    <AuthenticateWithRedirectCallback
      signInFallbackRedirectUrl="/draw"
      signUpFallbackRedirectUrl="/draw"
    />
  );
}
