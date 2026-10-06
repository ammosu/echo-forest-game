/** On-screen analog stick for touch play. Reports a horizontal axis in [-1, 1] with a small dead zone. */
export function mountJoystick(host: HTMLElement, onAxis: (x: number) => void, label: string) {
  host.classList.add('joystick');
  host.setAttribute('role', 'slider');
  host.setAttribute('aria-label', label);
  host.setAttribute('aria-valuemin', '-1');
  host.setAttribute('aria-valuemax', '1');
  host.setAttribute('aria-valuenow', '0');
  host.innerHTML = '<span class="joystick-arrow left">◀</span><span class="joystick-arrow right">▶</span><span class="joystick-knob"></span>';
  const knob = host.querySelector<HTMLElement>('.joystick-knob')!;
  let pointer: number | null = null;
  let axis = 0;
  const set = (x: number, dx: number, dy: number) => {
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    if (x === axis) return;
    axis = x;
    host.setAttribute('aria-valuenow', x.toFixed(2));
    host.classList.toggle('held-left', x < 0);
    host.classList.toggle('held-right', x > 0);
    onAxis(x);
  };
  const move = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    const radius = r.width / 2;
    const reach = radius * 0.62;
    let dx = e.clientX - (r.left + radius), dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > reach) { dx *= reach / d; dy *= reach / d; }
    const raw = dx / reach;
    // Dead zone, then rescale so a light push still steers and the edge is full lock.
    const x = Math.abs(raw) < 0.18 ? 0 : Math.sign(raw) * Math.min(1, (Math.abs(raw) - 0.18) / 0.72);
    set(Math.round(x * 100) / 100, dx, dy);
  };
  const release = () => { pointer = null; host.classList.remove('active'); set(0, 0, 0); };
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
