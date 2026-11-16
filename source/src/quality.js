// ============================================================================
// quality level and time of day, chosen before anything is built (pattern from Abyssal Garden, MIT)
// ============================================================================
// LV: 0 High, 1 Medium, 2 Low. Medium and Low use a smaller shadow map; Low also drops anti-aliasing and uses
// fewer light shaft steps.
// localStorage.hajj = "level,pixels,detail". hajjLoad is set while the world is built: still set on the
// next visit means that load crashed the tab, so this one runs a level lower.
// localStorage.hajjTime = 0 dawn, 1 golden hour, 2 night. Every bake depends on the light, so changing it reloads.
const mob = matchMedia('(pointer:coarse)').matches, mem = navigator.deviceMemory;
const keep = (k, v) => { try { localStorage[k] = v; } catch {} };
let SV = [], LV, bad, TOD = 0;
try { SV = (localStorage.hajj || '').split(','); bad = localStorage.hajjLoad; TOD = +(localStorage.hajjTime || 0) || 0; } catch {}
TOD = TOD > 2 || TOD < 0 ? 0 : TOD | 0;
LV = SV[0] ? +SV[0] : mob ? (mem > 7 ? 1 : 2) : mem <= 4 ? 2 : 0;
if (bad && LV < 2) { SV = [++LV]; keep('hajj', LV); }
const SHADOW = LV ? 2048 : 4096, AA = LV > 1 ? 1 : 4, RAYN = LV > 1 ? 10 : 24;
