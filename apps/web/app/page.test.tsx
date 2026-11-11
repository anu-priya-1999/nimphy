import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomePage from './page';

describe('HomePage smoke test', () => {
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
});
