import { describe,it,expect } from 'vitest';
import { getImpactText } from '../js/seva.js';
describe('seva calculator',()=>{
  it('maps tiers to impact',()=>{
    expect(getImpactText(101)).toContain('meal'); expect(getImpactText(501)).toContain('Veda'); expect(getImpactText(1101)).toContain('Homam');
  });
  it('custom amount scales',()=>{ expect(getImpactText(202)).toContain('2'); });
});
