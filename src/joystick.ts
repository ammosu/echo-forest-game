/**
 * On-screen analog stick for touch play. Reports axes in [-1, 1] with a small dead zone:
 * horizontal only by default, or both axes with `twoAxis` (y is positive downwards).
 */
export function mountJoystick(host: HTMLElement, onAxis: (x: number, y: number) => void, label: string, twoAxis = false) {
  host.classList.add('joystick');
  host.setAttribute('aria-label', label);
  if (twoAxis) host.setAttribute('role', 'application');
  else {
    host.setAttribute('role', 'slider');
    host.setAttribute('aria-valuemin', '-1');
    host.setAttribute('aria-valuemax', '1');
    host.setAttribute('aria-valuenow', '0');
  }
  host.innerHTML = (twoAxis ? '<span class="joystick-arrow up">▲</span><span class="joystick-arrow down">▼</span>' : '')
    + '<span class="joystick-arrow left">◀</span><span class="joystick-arrow right">▶</span><span class="joystick-knob"></span>';
  const knob = host.querySelector<HTMLElement>('.joystick-knob')!;
  let pointer: number | null = null;
  let axis = [0, 0];
  const set = (x: number, y: number, dx: number, dy: number) => {
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    if (x === axis[0] && y === axis[1]) return;
    axis = [x, y];
    if (!twoAxis) host.setAttribute('aria-valuenow', x.toFixed(2));
    host.classList.toggle('held-left', x < 0);
    host.classList.toggle('held-right', x > 0);
    host.classList.toggle('held-up', y < 0);
    host.classList.toggle('held-down', y > 0);
    onAxis(x, y);
  };
  // Dead zone, then rescale so a light push still steers and the edge is full lock.
  const shape = (raw: number) => Math.abs(raw) < 0.18 ? 0 : Math.round(Math.sign(raw) * Math.min(1, (Math.abs(raw) - 0.18) / 0.72) * 100) / 100;
  const move = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    const radius = r.width / 2;
    const reach = radius * 0.62;
    let dx = e.clientX - (r.left + radius), dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > reach) { dx *= reach / d; dy *= reach / d; }
    set(shape(dx / reach), twoAxis ? shape(dy / reach) : 0, dx, dy);
  };
  const release = () => { pointer = null; host.classList.remove('active'); set(0, 0, 0, 0); };
  host.addEventListener('pointerdown', e => {
    if (pointer !== null) return;
    e.preventDefault();
    pointer = e.pointerId;
    host.setPointerCapture(e.pointerId);
    host.classList.add('active');
    move(e);
  });
  host.addEventListener('pointermove', e => { if (e.pointerId === pointer) move(e); });
  host.addEventListener('pointerup', e => { if (e.pointerId === pointer) release(); });
  host.addEventListener('pointercancel', e => { if (e.pointerId === pointer) release(); });
  host.addEventListener('lostpointercapture', e => { if (e.pointerId === pointer) release(); });
  return { release };
}
