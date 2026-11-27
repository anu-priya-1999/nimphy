import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HomePage from './page';

const clerkMockState = vi.hoisted(() => ({
  authState: 'signed-out' as 'signed-out' | 'signed-in',
}));

vi.mock('@clerk/nextjs', () => ({
  Show: ({ when, children }: { when: string; children: ReactNode }) =>
    when === clerkMockState.authState ? <>{children}</> : null,
  SignInButton: ({ children }: { children?: ReactNode }) => <>{children}</>,
  SignUpButton: ({ children }: { children?: ReactNode }) => <>{children}</>,
  UserButton: () => (
    <button type="button" aria-label="User account">
      User account
    </button>
  ),
}));

describe('HomePage smoke test', () => {
  beforeEach(() => {
    clerkMockState.authState = 'signed-out';
  });

  it('renders the Nimphy heading and brand', () => {
    render(<HomePage />);
    const heading = screen.getByRole('heading', {
      name: /author royalty estimation & business case analysis/i,
    });
    expect(heading).toBeDefined();
    expect(screen.getByText(/^Nimphy$/)).toBeDefined();
  });

  it('displays the required illustrative scenario disclaimer', () => {
    render(<HomePage />);
    const disclaimer = screen.getByRole('note', { name: /disclaimer/i });
    expect(disclaimer).toBeDefined();
    expect(disclaimer.textContent).toContain('Illustrative Scenario Disclaimer');
  });

  it('exposes both authentication actions when signed out', () => {
    render(<HomePage />);
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /^get started$/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /user account/i })).toBeNull();
  });

  it('renders the user account control when signed in', () => {
    clerkMockState.authState = 'signed-in';
    render(<HomePage />);
    expect(screen.getByRole('button', { name: /user account/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /^sign in$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^get started$/i })).toBeNull();
  });
});
