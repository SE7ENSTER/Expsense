// Normalized points keep the signature stable as the canvas changes size on mobile.
export function signaturePad(canvas, onChange = () => {}) {
  let strokes = [],
    active = null,
    pointer = null;
  const context = canvas.getContext("2d");
  function redraw() {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#123d2d";
    context.lineWidth = 2.4;
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const stroke of strokes) {
      context.beginPath();
      stroke.forEach((p, i) =>
        i
          ? context.lineTo(p.x * canvas.width, p.y * canvas.height)
          : context.moveTo(p.x * canvas.width, p.y * canvas.height),
      );
      context.stroke();
    }
  }
  function point(event) {
    const box = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
      y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)),
    };
  }
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    if (pointer !== null) return;
    event.preventDefault();
    pointer = event.pointerId;
    canvas.setPointerCapture?.(pointer);
    active = [point(event)];
    strokes.push(active);
    onChange();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointer || !active) return;
    event.preventDefault();
    if (active.length < 2000) active.push(point(event));
    redraw();
  });
  const end = (event) => {
    if (event.pointerId !== pointer) return;
    active = null;
    pointer = null;
    redraw();
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("lostpointercapture", () => {
    active = null;
    pointer = null;
  });
  return {
    clear() {
      strokes = [];
      active = null;
      pointer = null;
      redraw();
      onChange();
    },
    hasInk() {
      return strokes.some(
        (stroke) =>
          stroke.length >= 3 &&
          stroke.some(
            (p) => Math.hypot(p.x - stroke[0].x, p.y - stroke[0].y) > 0.015,
          ),
      );
    },
    png() {
      return this.hasInk() ? canvas.toDataURL("image/png") : "";
    },
  };
}
