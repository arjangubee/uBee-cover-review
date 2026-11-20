// A strip the color of the page behind a phone's status bar, so the list scrolls under it cleanly (1.14).
// It's as tall as the phone's top safe area, which is 0 on a computer.
export function SafeAreaTopScrim({ backgroundColor }) {
  return (
    <div
      aria-hidden="true"
      style={{ position: "fixed", top: 0, left: 0, right: 0, height: "env(safe-area-inset-top, 0px)", background: backgroundColor, zIndex: 30, pointerEvents: "none" }}
    />
  );
}
