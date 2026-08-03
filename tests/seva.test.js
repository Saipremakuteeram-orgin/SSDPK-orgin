// tests/seva.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { createDonorFromForm } from '../js/seva.js';

describe('seva donor extraction', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form class="seva-donor">
        <input id="sevaName" value="Sai Ram">
        <input id="sevaEmail" value="dev@sspk.org">
        <input id="sevaPhone" value="9876543210">
      </form>
    `;
  });
  it('extracts donor details from the form', () => {
    const d = createDonorFromForm(document);
    expect(d.name).toBe('Sai Ram');
    expect(d.email).toBe('dev@sspk.org');
    expect(d.phone).toBe('9876543210');
  });
});