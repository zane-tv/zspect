import type {
  AnimationSummary,
  FlightCapsule,
  FrameworkMeta,
  ProbeRequestMessage,
  ProbeResponseMessage,
} from '@/types/zspect';

type ProbeRequestPayload = ProbeRequestMessage extends infer T
  ? T extends { id: string }
    ? Omit<T, 'id'>
    : never
  : never;

export class MainWorldProbeClient {
  private port: MessagePort | null = null;
  private pending = new Map<
    string,
    { resolve: (val: ProbeResponseMessage) => void; timer: number }
  >();
  private connected = false;

  async connect(): Promise<boolean> {
    if (this.connected && this.port) return true;

    return new Promise<boolean>((resolve) => {
      const channel = new MessageChannel();
      const nonce = `zs-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      this.port = channel.port1;

      const timeout = window.setTimeout(() => {
        if (!this.connected) resolve(false);
      }, 600);

      this.port.onmessage = (event: MessageEvent<ProbeResponseMessage>) => {
        const msg = event.data;
        if (!msg) return;

        if (msg.id === nonce && !this.connected) {
          this.connected = true;
          window.clearTimeout(timeout);
          resolve(true);
          return;
        }

        const waiter = this.pending.get(msg.id);
        if (waiter) {
          window.clearTimeout(waiter.timer);
          this.pending.delete(msg.id);
          waiter.resolve(msg);
        }
      };

      this.port.start();
      window.postMessage({ source: 'zspect-probe-init', nonce }, '*', [channel.port2]);
    });
  }

  private async request(
    payload: ProbeRequestPayload,
    timeoutMs = 800,
  ): Promise<ProbeResponseMessage> {
    const ok = await this.connect();
    if (!ok || !this.port) {
      return { id: 'disconnected', ok: false, error: 'Probe not connected' };
    }

    const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    return new Promise<ProbeResponseMessage>((resolve) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        resolve({ id, ok: false, error: 'Probe request timeout' });
      }, timeoutMs);

      this.pending.set(id, { resolve, timer });
      this.port!.postMessage({ ...payload, id } as ProbeRequestMessage);
    });
  }

  async inspectElement(selector: string): Promise<{
    frameworkMeta: FrameworkMeta;
    flightCapsule?: FlightCapsule;
  }> {
    const res = await this.request({ action: 'INSPECT_ELEMENT', selector });
    return {
      frameworkMeta: res.frameworkMeta ?? { framework: 'unknown', componentStack: [] },
      flightCapsule: res.flightCapsule,
    };
  }

  async getFlightCapsule(): Promise<FlightCapsule | undefined> {
    const res = await this.request({ action: 'GET_FLIGHT_CAPSULE' });
    return res.flightCapsule;
  }

  async listAnimations(selector?: string): Promise<AnimationSummary[]> {
    const res = await this.request({ action: 'LIST_ANIMATIONS', selector });
    return res.animations ?? [];
  }

  async scrubAnimations(
    progress: number,
    pause = true,
    selector?: string,
  ): Promise<AnimationSummary[]> {
    const res = await this.request({
      action: 'SCRUB_ANIMATIONS',
      progress,
      pause,
      selector,
    });
    return res.animations ?? [];
  }

  async resumeAnimations(): Promise<void> {
    await this.request({ action: 'RESUME_ANIMATIONS' });
  }
}
