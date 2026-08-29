import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const clerk = vi.hoisted(() => ({
  createSignIn: vi.fn(),
  attemptFirstFactor: vi.fn(),
  attemptSecondFactor: vi.fn(),
  resetPassword: vi.fn(),
  setActive: vi.fn(),
}));

vi.mock('@clerk/clerk-react', () => ({
  AuthenticateWithRedirectCallback: () => null,
  useAuth: () => ({ isSignedIn: false }),
  useClerk: () => ({ setActive: clerk.setActive }),
  useSignIn: () => ({
    isLoaded: true,
    signIn: {
      create: clerk.createSignIn,
      attemptFirstFactor: clerk.attemptFirstFactor,
      attemptSecondFactor: clerk.attemptSecondFactor,
      resetPassword: clerk.resetPassword,
      authenticateWithRedirect: vi.fn(),
    },
  }),
  useSignUp: () => ({
    isLoaded: true,
    signUp: {
      create: vi.fn(),
      authenticateWithRedirect: vi.fn(),
      prepareEmailAddressVerification: vi.fn(),
      attemptEmailAddressVerification: vi.fn(),
    },
  }),
}));

import { AuthPage } from '@/components/auth/AuthPage';

function renderSignIn() {
  return render(
    <MemoryRouter initialEntries={['/auth/sign-in']}>
      <Routes>
        <Route path="/auth/:mode" element={<AuthPage />} />
        <Route path="/draw" element={<div>Canvas</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AuthPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('completes the password recovery flow', async () => {
    const user = userEvent.setup();
    clerk.createSignIn.mockResolvedValue({ status: 'needs_first_factor' });
    clerk.attemptFirstFactor.mockResolvedValue({ status: 'needs_new_password' });
    clerk.resetPassword.mockResolvedValue({ status: 'complete', createdSessionId: 'session-1' });
    renderSignIn();

    await user.type(screen.getByLabelText('Email address'), 'artist@example.com');
    await user.click(screen.getByRole('button', { name: 'Forgot your password?' }));
    expect(clerk.createSignIn).toHaveBeenCalledWith({
      strategy: 'reset_password_email_code',
      identifier: 'artist@example.com',
    });

    await user.type(screen.getByLabelText('Reset code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify reset code' }));
    await user.type(screen.getByLabelText('New password'), 'new-password-123');
    await user.click(screen.getByRole('button', { name: 'Set new password' }));

    expect(clerk.resetPassword).toHaveBeenCalledWith({
      password: 'new-password-123',
      signOutOfOtherSessions: true,
    });
    expect(clerk.setActive).toHaveBeenCalledWith({ session: 'session-1' });
    expect(await screen.findByText('Canvas')).toBeInTheDocument();
  });

  it('prepares and verifies an email second factor after password sign-in', async () => {
    const user = userEvent.setup();
    const prepareSecondFactor = vi.fn().mockResolvedValue(undefined);
    clerk.createSignIn.mockResolvedValue({
      status: 'needs_second_factor',
      supportedSecondFactors: [
        { strategy: 'email_code', emailAddressId: 'email-1', safeIdentifier: 'a***@example.com' },
      ],
      prepareSecondFactor,
    });
    clerk.attemptSecondFactor.mockResolvedValue({
      status: 'complete',
      createdSessionId: 'session-2',
    });
    renderSignIn();

    await user.type(screen.getByLabelText('Email address'), 'artist@example.com');
    await user.type(screen.getByLabelText('Password'), 'password-123');
    await user.click(screen.getByRole('button', { name: 'Continue to SketchFlow' }));

    expect(prepareSecondFactor).toHaveBeenCalledWith({
      strategy: 'email_code',
      emailAddressId: 'email-1',
    });
    await user.type(screen.getByLabelText('Verification code'), '654321');
    await user.click(screen.getByRole('button', { name: 'Complete sign in' }));
    expect(clerk.attemptSecondFactor).toHaveBeenCalledWith({
      strategy: 'email_code',
      code: '654321',
    });
    expect(clerk.setActive).toHaveBeenCalledWith({ session: 'session-2' });
  });
});
