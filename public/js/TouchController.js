// Touch & Virtual Joystick Controller for Mobile Devices

export class TouchController {
  constructor(inputCallback, audioEngine) {
    this.inputCallback = inputCallback;
    this.audioEngine = audioEngine;
    this.container = null;
    this.dpad = null;
    this.actionBtn = null;

    this.touchId = null;
    this.startX = 0;
    this.startY = 0;
    this.currentDx = 0;
    this.currentDy = 0;
    this.isPowerupPressed = false;

    this.initDOM();
  }

  initDOM() {
    this.container = document.getElementById('mobile-controls');
    if (!this.container) return;

    this.dpad = document.getElementById('virtual-joystick');
    this.knob = document.getElementById('joystick-knob');
    this.actionBtn = document.getElementById('btn-mobile-action');

    if (!this.dpad || !this.actionBtn) return;

    // Joystick Touch Listeners
    this.dpad.addEventListener('touchstart', (e) => this.handleJoystickStart(e), { passive: false });
    window.addEventListener('touchmove', (e) => this.handleJoystickMove(e), { passive: false });
    window.addEventListener('touchend', (e) => this.handleJoystickEnd(e), { passive: false });
    window.addEventListener('touchcancel', (e) => this.handleJoystickEnd(e), { passive: false });

    // Action Button Touch Listener
    this.actionBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.isPowerupPressed = true;
      this.actionBtn.classList.add('active');
      this.audioEngine?.playClick();
      this.dispatch();
    }, { passive: false });

    this.actionBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.isPowerupPressed = false;
      this.actionBtn.classList.remove('active');
      this.dispatch();
    }, { passive: false });
  }

  handleJoystickStart(e) {
    e.preventDefault();
    this.audioEngine?.resume();
    const touch = e.targetTouches[0];
    this.touchId = touch.identifier;

    const rect = this.dpad.getBoundingClientRect();
    this.startX = rect.left + rect.width / 2;
    this.startY = rect.top + rect.height / 2;

    this.updateJoystick(touch.clientX, touch.clientY);
  }

  handleJoystickMove(e) {
    if (this.touchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.touchId) {
        e.preventDefault();
        this.updateJoystick(touch.clientX, touch.clientY);
        break;
      }
    }
  }

  handleJoystickEnd(e) {
    if (this.touchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.touchId) {
        this.touchId = null;
        this.currentDx = 0;
        this.currentDy = 0;
        if (this.knob) {
          this.knob.style.transform = `translate(0px, 0px)`;
        }
        this.dispatch();
        break;
      }
    }
  }

  updateJoystick(clientX, clientY) {
    const deltaX = clientX - this.startX;
    const deltaY = clientY - this.startY;
    const maxRadius = 45;

    const distance = Math.hypot(deltaX, deltaY);
    const angle = Math.atan2(deltaY, deltaX);

    const clampedDist = Math.min(distance, maxRadius);
    const knobX = Math.cos(angle) * clampedDist;
    const knobY = Math.sin(angle) * clampedDist;

    if (this.knob) {
      this.knob.style.transform = `translate(${knobX}px, ${knobY}px)`;
    }

    if (distance > 6) {
      this.currentDx = Math.cos(angle);
      this.currentDy = Math.sin(angle);
    } else {
      this.currentDx = 0;
      this.currentDy = 0;
    }

    this.dispatch();
  }

  dispatch() {
    if (typeof this.inputCallback === 'function') {
      this.inputCallback({
        dx: this.currentDx,
        dy: this.currentDy,
        usePowerup: this.isPowerupPressed
      });
    }
  }
}
