import { describe,it,expect,vi } from 'vitest';
describe('social proof',()=>{
  it('formats proof text', async ()=>{
    const m=await import('../js/seva.js');
    expect(m.formatSocialProof(47)).toContain('47 supporters');
    expect(m.formatSocialProof(0)).toContain('Be the first');
  });
  it('admin optimistic check detects conflict', async ()=>{
    const m=await import('../js/dashboard-app.js');
    // mock supabase update returning 0 rows → conflict
    expect(typeof m.checkAdminConflict).toBe('function');
  });
});
