// After discharge 4.1: discharge facts, credit points, grant, deposit and work-grant estimates (pure; WS-MODULES).
export const DISCHARGE_FACTS={asOf:'2026-10-14'};
export function normalizeBenefits(raw){return raw&&typeof raw==='object'&&!Array.isArray(raw)?{...raw}:{};}
