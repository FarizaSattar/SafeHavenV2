const BASE = import.meta.env.VITE_SAFEHAVEN_API || 'http://localhost:5002';
async function get(path){const r=await fetch(`${BASE}${path}`);if(!r.ok)throw new Error(`${r.status} ${r.statusText}`);return r.json()}
export const safeApi={health:()=>get('/api/health'),telemetry:(limit=500)=>get(`/api/telemetry?limit=${limit}`),reliability:()=>get('/api/reliability')};
