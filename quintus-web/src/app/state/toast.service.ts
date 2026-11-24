import { Injectable, signal } from '@angular/core';

export interface Toast {
  text: string;
  error: boolean;
}

/** Messages courts en bas d'écran */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly current = signal<Toast | null>(null);
  private timer?: ReturnType<typeof setTimeout>;

  show(text: string, error = false): void {
    this.current.set({ text, error });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.current.set(null), error ? 6000 : 3200);
  }
}
